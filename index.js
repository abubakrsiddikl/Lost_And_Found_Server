require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;

// use middleware
app.use(cors());
app.use(express.json());

// root server
app.get("/", (req, res) => {
  res.send("Lost and found item server is running");
});

// foundlostadmin
// KhZ0AEkWg1Dz2g0C

// TODO : connect to database

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.h3mkc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    // create a collection
    const lostAndFoundItemsCollection = client
      .db("lostAndFoundItemsCollection")
      .collection("items");
    // items related apis
    // get all item to database
    app.get("/allItems", async (req, res) => {
      const cursor = lostAndFoundItemsCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    //get the specified item to database
    app.get("/items/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await lostAndFoundItemsCollection.findOne(query);
      res.send(result);
    });

    // get specified user added item
    app.get("/myItems/:email", async (req, res) => {
      const userEmail = req.params.email;
      const query = { email: userEmail };
      const result = await lostAndFoundItemsCollection.find(query).toArray();
      res.send(result);
    });

    // create item data to database
    app.post("/addItems", async (req, res) => {
      const item = req.body;
      const result = await lostAndFoundItemsCollection.insertOne(item);
      res.send(item);
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// add listen
app.listen(port, () => {
  console.log(`Server running on this Port : ${port}`);
});
