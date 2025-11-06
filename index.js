const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const jwt = require('jsonwebtoken');
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 3000;


const serviceAccount = require("./smart-deals-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// middleware
app.use(cors());
app.use(express.json());

const logger = (req, res, next) =>{
  console.log("login information");
  next();
}

// const verifyFireBaseToken = async(req, res, next) =>{
//   console.log("verify token", req.headers.authorization)
//   if(!req.headers.authorization){
//     // do not allow
//     return res.status(401).send({message: "unauthorized access"})
//   }
//   const token = req.headers.authorization.split(" ")[1];
//   if(!token){
//     return res.status(401).send({message: "unauthorized access"})
//   }
//   // verify token
//   try{
//     const tokenInfo = await admin.auth().verifyIdToken(token)
//     req.token_email = tokenInfo.email;
//     console.log("after token verification",tokenInfo)
//     next();
//   }
//   catch{
//      return res.status(401).send({message: "unauthorized access"})
//   }
// }

const verifyFirebaseToken = async(req, res, next)=>{
  const authorization = req.headers.authorization;

  if(!authorization){
    return res.status(401).send({message: "unauthorize access"})
  }
  const token = authorization.split(" ")[1]
  if(!token){
    return res.status(401).send({message: "unauthorize access"})
  }
  try{
    const decoded = await admin.auth().verifyIdToken(token)
    req.token_email = decoded.email
    // console.log("after token verification", decoded)
    next();
  }
  catch{
    return res.status(401).send({message: "unauthorized access"});
  }
}

const verifyJWTToken = (req, res, next) =>{
  // console.log("in middleware", req.headers)
  const authorization = req.headers.authorization
  if(!authorization){
    return res.status(401).send({message: "unauthorized access"})
  }
  const token = authorization.split(" ")[1];
  if(!token){
    return res.status(401).send({message: "unauthorized access"})
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded)=>{
    if(err){
      return res.status(401).send({message: "unauthorized access"})
    }
    console.log("after decoded", decoded)
    req.token_email = decoded.email;
    next()
  })
}

const uri =`mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.k11w7kv.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("Smart Deals Server is running");
});

const run = async () => {
  try {
    await client.connect();

    const database = client.db("smart-db");
    const productsCollection = database.collection("products");
    const bidsCollection = database.collection("bids");
    const usersCollection = database.collection("users");

    // jwt related apis
    app.post("/getToken",(req, res)=>{
      const loggedUser = req.body;
      const token = jwt.sign(loggedUser, process.env.JWT_SECRET , {expiresIn: "1h"})
      res.send({token: token});
    })

    // users related apis
    app.post("/users", async (req, res) => {
      const newUser = req.body;
      const email = req.body.email;
      const query = { email: email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        res.send({message:"user already exist"});
      } else {
        const result = await usersCollection.insertOne(newUser);
        res.send(result);
      }
    });

    // product related apis
    app.get("/products",verifyFirebaseToken, async (req, res) => {
      // const projectField = {title: 1, price_min: 1, price_max: 1, image: 1}
      // const cursor = productsCollection.find().sort({price_min: -1}).limit(2).skip(2).project(projectField);
      console.log(req.query);
      const email = req.query.email;
      const query = {};
      if (email) {
        query.email = email;
      }
      const cursor = productsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/products/:id", async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };
      const result = await productsCollection.findOne(query);
      res.send(result);
    });

    app.get("/latest-products", async(req, res)=>{
      const cursor = productsCollection.find().sort({created_at: 1}).limit(6);
      const result = await cursor.toArray();
      res.send(result);
    })

    app.post("/products",verifyFirebaseToken, async (req, res) => {
      console.log("headers in the post", req.headers)
      const newProduct = req.body;
      const result = await productsCollection.insertOne(newProduct);
      res.send(result);
    });

    app.patch("/products/:id", async (req, res) => {
      const id = req.params.id;
      const updatedProduct = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: {
          name: updatedProduct.name,
          price: updatedProduct.price,
        },
      };
      const result = await productsCollection.updateOne(query, update);
      res.send(result);
    });

    app.delete("/products/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productsCollection.deleteOne(query);
      res.send(result);
    });

    // bids related apis
    app.get("/bids",verifyFirebaseToken, async(req, res)=>{
      const email = req.query.email;
      const query ={};
      if(email){
        query.buyer_email = email;
      }
      if(email !== req.token_email){
        return res.status(403).send({message: "forbidden access"})
      }
      const cursor = bidsCollection.find(query).sort({bid_price: -1})
      const result = await cursor.toArray()
      res.send(result);
    })

    // bids related apis with firebase token verification
    // app.get("/bids", logger, verifyFireBaseToken, async (req, res) => {
    //   console.log("headers",req)
    //   const email = req.query.email;
    //   const query = {};
    //   if (email) {
    //     if(email !== req.token_email){
    //       return res.status(403).send({message: "forbidden access"})
    //     }
    //     query.buyer_email = email;
    //   }
    //   const cursor = bidsCollection.find(query).sort({bid_price: -1});
    //   const result = await cursor.toArray();
    //   res.send(result);
    // });

    app.get("/bids/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bidsCollection.findOne(query);
      res.send(result);
    });

    app.get("/products/bids/:productId",verifyFirebaseToken, async(req, res)=>{
      const productId = req.params.productId;
      const query = {product: productId}
      const cursor = bidsCollection.find(query).sort({bid_price: -1});
      const result = await cursor.toArray()
      res.send(result);
    })

    app.post("/bids", async (req, res) => {
      const newBids = req.body;
      const result = await bidsCollection.insertOne(newBids);
      res.send(result);
    });

    app.delete("/bids/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bidsCollection.deleteOne(query);
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
};

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Smart Deals server is running on port: ${port}`);
});
