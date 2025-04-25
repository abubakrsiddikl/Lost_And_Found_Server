require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const {
  MongoClient,
  ServerApiVersion,
  ObjectId,
  ReturnDocument,
} = require("mongodb");
const http = require("http");
const { Server } = require("socket.io");
const { serialize } = require("v8");
const app = express();
const port = process.env.PORT || 5000;

// ! create http server
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: [
      "http://localhost:5173",
      "https://lost-and-found-web-8dbe0.web.app",
      "https://lost-and-found-web-8dbe0.firebaseapp.com",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// use middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://lost-and-found-web-8dbe0.web.app",
      "https://lost-and-found-web-8dbe0.firebaseapp.com",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// veryfiToken
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: "UnAuthorized Access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "UnAuthorized Access" });
    }
    req.user = decoded;
    // console.log(req.user)
    next();
  });
};

// root server
app.get("/", (req, res) => {
  res.send("Lost and found item server is running");
});


// Inside async function run()
app.get("/user", verifyToken, async (req, res) => {
  try {
    res.send({ user: req.user }); // req.user is set by verifyToken middleware
  } catch (error) {
    console.error("Error fetching user info:", error);
    res.status(500).send({ message: "Failed to fetch user info" });
  }
});

// foundlostadmin
// KhZ0AEkWg1Dz2g0C

// ! connect to database

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
    const recoveredItemsCollection = client
      .db("lostAndFoundItemsCollection")
      .collection("recoveredItems");
    const messagesCollection = client
      .db("lostAndFoundItemsCollection")
      .collection("messages");

    // jwt authentications related apis
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "3d",
      });
      res
        .cookie("token", token, {
          httpOnly: false,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });


    // after logout to delete token to cookie
    app.post("/logout", async (req, res) => {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // ! socket io connection with jwt verification
    io.use((socket, next) => {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error("Authentication error: Invalid token"));
      }
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return next(new Error("Authentication error: Invalid token"));
        }
        socket.user = decoded; // Attach decoded user info to socket
        next();
      });
    });

    // ! create socket connection on client and server
    io.on("connection", (socket) => {
      console.log(`User connected: ${socket.user.email}`);

      // Join a room (e.g., based on user email or item ID)
      socket.join(socket.user.email);

      // Handle sending a message
      socket.on("sendMessage", async (data) => {
        const { recipientEmail, message } = data;
        const chatMessage = {
          sender: socket.user.email,
          recipient: recipientEmail,
          message,
          timestamp: new Date(),
        };

        // Save message in MongoDB
        await messagesCollection.insertOne(chatMessage);

        // Emit message to recipient's room
        io.to(recipientEmail).emit("receiveMessage", chatMessage);
        // Optionally, send back to sender too
        socket.emit("receiveMessage", chatMessage);
      });

      socket.on("disconnect", () => {
        console.log(`User disconnected: ${socket.user.email}`);
      });
    });

    // Chat-related API: Gets message history between two users
    app.get("/messages/:recipientEmail", verifyToken, async (req, res) => {
      const senderEmail = req.user.email;
      const recipientEmail = req.params.recipientEmail;
      const messages = await messagesCollection
        .find({
          $or: [
            { sender: senderEmail, recipient: recipientEmail },
            { sender: recipientEmail, recipient: senderEmail },
          ],
        })
        .sort({ timestamp: 1 })
        .toArray();
      res.send(messages);
    });

    // items related apis
    // get all item to database
    app.get("/allItems", async (req, res) => {
      const { searchParams } = req.query;
      // console.log(searchParams);
      let option = {};
      if (searchParams) {
        option = {
          $or: [
            {
              title: { $regex: searchParams, $options: "i" },
            },
            {
              location: { $regex: searchParams, $options: "i" },
            },
          ],
        };
      }

      const result = await lostAndFoundItemsCollection.find(option).toArray();
      res.send(result);
    });

    // get latest 6 data depend on date to database
    app.get("/latestPost", async (req, res) => {
      const result = await lostAndFoundItemsCollection
        .find()
        .sort({ date: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    //get the specified item to database
    app.get("/items/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await lostAndFoundItemsCollection.findOne(query);
      res.send(result);
    });

    // get specified user added item
    app.get("/myItems/:email", verifyToken, async (req, res) => {
      const userEmail = req.params.email;
      // console.log(req.cookies?.token)
      if (req.user.email !== userEmail) {
        return res.status(403).send({ message: "Forbidden" });
      }
      const query = { email: userEmail };
      const result = await lostAndFoundItemsCollection.find(query).toArray();
      res.send(result);
    });

    // get all revored items to database
    app.get("/allRecovered/:email", verifyToken, async (req, res) => {
      const userEmail = req.params.email;
      // console.log(userEmail);
      const query = { email: userEmail };
      const result = await recoveredItemsCollection.find(query).toArray();
      res.send(result);
    });

    // update a itme to database
    app.put("/updateItems/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: req.body,
      };
      const result = await lostAndFoundItemsCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });
    // create item data to database
    app.post("/addItems", async (req, res) => {
      const item = req.body;
      const result = await lostAndFoundItemsCollection.insertOne(item);
      res.send(item);
    });

    // post recoverd item collection
    app.post("/allRecovered", async (req, res) => {
      const item = req.body;
      const result = await recoveredItemsCollection.insertOne(item);
      res.send(result);
    });

    // update status
    app.patch("/updateStatus/:id", async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: data.status,
        },
      };
      const result = await lostAndFoundItemsCollection.updateOne(
        filter,
        updateDoc
      );
      res.send(result);
    });

    // delete a item to databse
    app.delete("/item/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await lostAndFoundItemsCollection.deleteOne(query);
      res.send(result);
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// add listen
httpServer.listen(port, () => {
  console.log(`Server running on this Port : ${port}`);
});
