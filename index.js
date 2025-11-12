const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const decoded = Buffer.from(
  process.env.FIREBASE_ACCOUNT_KEY,
  "base64"
).toString("utf8");
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uri = `mongodb+srv://${process.env.SECRET_NAME}:${process.env.SECRET_KEY}@cluster0.ql1be0w.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
const verifyToken = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = authorization.split(" ")[1];
  try {
    const decode = await admin.auth().verifyIdToken(token);
    req.token_email = decode.email;
    next();
  } catch (error) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};
app.get("/", (req, res) => {
  res.send("Server is running.");
});
async function run() {
  try {
    // await client.connect();
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
      const { category } = req.query;
      const query = { visibility: "public" };

      if (category) query.category = category;

      const result = await artsCollection.find(query).toArray();
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

    app.get("/my-artworks", verifyToken, async (req, res) => {
      const artistEmail = req.query.artistEmail;
      if (artistEmail !== req.token_email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const result = await artsCollection.find({ artistEmail }).toArray();
      res.send(result);
    });

    app.get("/artworks/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const result = await artsCollection.findOne({
        _id: new ObjectId(id),
      });

      res.send(result);
    });
    app.get("/artists/:email", verifyToken, async (req, res) => {
      const artist = await usersCollection.findOne({ email: req.params.email });
      res.send(artist);
    });

    app.put("/artworks/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const updatedArt = req.body;
      if (!ObjectId.isValid(id))
        return res.status(400).send({ error: "Invalid artwork ID" });
      const allowedFields = ["title", "medium", "image", "description"];
      const updatePayload = {};
      allowedFields.forEach((field) => {
        if (updatedArt[field] !== undefined)
          updatePayload[field] = updatedArt[field];
      });
      const result = await artsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatePayload }
      );
      if (result.matchedCount === 0) {
        return res.status(404).send({ error: "Artwork not found" });
      }
      res.send({ success: true, message: "Artwork updated successfully" });
    });

    app.patch("/artworks/:id/like", verifyToken, async (req, res) => {
      const { userEmail } = req.body;
      const { id } = req.params;
      if (!ObjectId.isValid(id))
        return res.status(400).send({ error: "Invalid ID" });
      const objectId = new ObjectId(id);
      const art = await artsCollection.findOne({ _id: objectId });
      if (!art) return res.status(404).send({ error: "Artwork not found" });
      const likedBy = Array.isArray(art.likedBy) ? art.likedBy : [];
      const alreadyLiked = likedBy.includes(userEmail);
      const update = alreadyLiked
        ? { $pull: { likedBy: userEmail } }
        : { $push: { likedBy: userEmail } };
      await artsCollection.updateOne({ _id: objectId }, update);
      const newLikeCount = alreadyLiked
        ? likedBy.length - 1
        : likedBy.length + 1;
      res.send({
        success: true,
        liked: !alreadyLiked,
        likeCount: newLikeCount,
      });
    });
    app.patch("/artworks/:id/favorite", verifyToken, async (req, res) => {
      const { userEmail } = req.body;
      const id = req.params.id;
      const art = await artsCollection.findOne({ _id: new ObjectId(id) });
      const favorites = Array.isArray(art.favorites) ? art.favorites : [];
      const alreadyFav = favorites.includes(userEmail);
      const update = alreadyFav
        ? { $pull: { favorites: userEmail } }
        : { $push: { favorites: userEmail } };
      const result = await artsCollection.updateOne(
        { _id: new ObjectId(id) },
        update
      );
      res.send({ success: true, favorited: !alreadyFav });
    });
    app.get("/favorites/:userEmail", async (req, res) => {
      const { userEmail } = req.params;
      const favorites = await artsCollection
        .find({ favorites: userEmail })
        .toArray();
      res.send(favorites);
    });
    app.delete("/artworks/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const result = await artsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });
    // await client.db("admin").command({ ping: 1 });
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
