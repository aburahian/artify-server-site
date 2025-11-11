const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.SECRET_NAME}:${process.env.SECRET_KEY}@cluster0.ql1be0w.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
app.get("/", (req, res) => {
  res.send("Server is running.");
});
async function run() {
  try {
    await client.connect();
    const artsDB = client.db("artsDB");
    const artsCollection = artsDB.collection("arts");
    const usersCollection = artsDB.collection("users");
    app.post("/artWorks", async (req, res) => {
      const data = req.body;
      const result = await artsCollection.insertOne(data);
      res.send(result);
    });
    app.post("/users", async (req, res) => {
      const data = req.body;
      const result = await usersCollection.insertOne(data);
      res.send(result);
    });

    app.get("/artWorks", async (req, res) => {
      const result = await artsCollection
        .find({ visibility: "public" })
        .toArray();
      res.send(result);
    });
    app.get("/search", async (req, res) => {
      const search_text = req.query.search;
      const query = {
        $or: [
          { title: { $regex: search_text, $options: "i" } },
          { artistName: { $regex: search_text, $options: "i" } },
        ],
      };
      const result = await artsCollection.find(query).toArray();
      res.send(result);
    });
    app.get("/latest-art", async (req, res) => {
      const result = await artsCollection
        .find()
        .sort({
          created_at: -1,
        })
        .limit(6)
        .toArray();
      res.send(result);
    });
    app.get("/artworks/:id", async (req, res) => {
      const id = req.params.id;
      const result = await artsCollection.findOne({
        _id: new ObjectId(id),
      });

      res.send(result);
    });
    app.get("/artists/:email", async (req, res) => {
      const artist = await usersCollection.findOne({ email: req.params.email });
      res.send(artist);
    });

    app.get("/artworks", async (req, res) => {
      const { artist } = req.query;
      const query = artist ? { artistEmail: artist } : {};
      const result = await artsCollection.find(query).toArray();
      res.send(result);
    });
    app.patch("/artworks/:id/like", async (req, res) => {
      const { id } = req.params;
      const { email } = req.body;

      try {
        const artwork = await artsCollection.findOne({ _id: new ObjectId(id) });
        if (!artwork)
          return res.status(404).json({ message: "Artwork not found" });

        let liked;
        if (artwork.likes?.includes(email)) {
          await artsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $pull: { likes: email } }
          );
          liked = false;
        } else {
          await artsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $push: { likes: email } }
          );
          liked = true;
        }

        res.json({ liked });
      } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
      }
    });
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);
app.listen(port, (req, res) => {
  console.log(`Server is running on port :${port} `);
});
