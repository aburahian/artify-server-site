const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
const port = process.env.PORT || 3000;

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://artify-client-site.web.app",
      "https://artify-client-site.firebaseapp.com",
      "https://cheerful-cat-006046.netlify.app"
    ],
    credentials: true,
    optionsSuccessStatus: 200,
  })
);
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

    app.post("/artworks", verifyToken, async (req, res) => {
      const data = req.body;
      if (data.artistEmail !== req.token_email) {
        return res.status(403).send({ message: "Forbidden: Cannot post for another account" });
      }
      const result = await artsCollection.insertOne(data);
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const data = req.body;
      // Check if user already exists
      const query = { email: data.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await usersCollection.insertOne(data);
      res.send(result);
    });

    app.get("/artworks", async (req, res) => {
      const { category, artist, search, sortField, sortOrder, limit = 8, page = 1 } = req.query;
      const query = { visibility: "public" };

      if (category) query.category = category;
      if (artist) query.artistEmail = artist;
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: "i" } },
          { artistName: { $regex: search, $options: "i" } },
        ];
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const sortOptions = {};

      // Handle predefined sort strings or direct fields
      if (sortField === 'priceLow') {
        sortOptions.price = 1;
      } else if (sortField === 'priceHigh') {
        sortOptions.price = -1;
      } else if (sortField === 'oldest') {
        sortOptions.createdAt = 1;
      } else if (sortField) {
        sortOptions[sortField] = sortOrder === 'desc' ? -1 : 1;
      } else {
        sortOptions.createdAt = -1; // Newest First - default
      }

      const totalItems = await artsCollection.countDocuments(query);
      const result = await artsCollection
        .find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();

      res.send({
        data: result,
        meta: {
          total: totalItems,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(totalItems / parseInt(limit))
        }
      });
    });
    app.get("/latest-art", async (req, res) => {
      const result = await artsCollection
        .find({ visibility: "public" })
        .sort({
          createdAt: -1,
        })
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.get("/my-artworks", verifyToken, async (req, res) => {
      const { artistEmail, limit = 10, page = 1 } = req.query;
      if (artistEmail !== req.token_email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const query = { artistEmail };
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const totalItems = await artsCollection.countDocuments(query);
      const result = await artsCollection
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();

      res.send({
        data: result,
        meta: {
          total: totalItems,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(totalItems / parseInt(limit))
        }
      });
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

      const filter = { _id: new ObjectId(id) };
      const art = await artsCollection.findOne(filter);

      if (!art) return res.status(404).send({ error: "Artwork not found" });
      if (art.artistEmail !== req.token_email) {
        return res.status(403).send({ error: "Forbidden: Not your artwork" });
      }

      const allowedFields = ["title", "medium", "image", "description", "category", "price", "dimensions", "visibility"];
      const updatePayload = {};
      allowedFields.forEach((field) => {
        if (updatedArt[field] !== undefined)
          updatePayload[field] = updatedArt[field];
      });

      const result = await artsCollection.updateOne(filter, { $set: updatePayload });
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
      if (!ObjectId.isValid(id)) return res.status(400).send({ error: "Invalid ID" });

      const filter = { _id: new ObjectId(id) };
      const art = await artsCollection.findOne(filter);

      if (!art) return res.status(404).send({ error: "Artwork not found" });
      if (art.artistEmail !== req.token_email) {
        return res.status(403).send({ error: "Forbidden: Not your artwork" });
      }

      const result = await artsCollection.deleteOne(filter);
      res.send(result);
    });
    app.get("/admin/stats", verifyToken, async (req, res) => {
      // Basic admin check - in real app would use a role field in DB
      if (req.token_email !== "admin@artify.com") {
        return res.status(403).send({ message: "Access denied: Admin only" });
      }

      const totalArts = await artsCollection.countDocuments();
      const totalUsers = await usersCollection.countDocuments();

      const likesStats = await artsCollection.aggregate([
        { $project: { numLikes: { $size: { $ifNull: ["$likedBy", []] } } } },
        { $group: { _id: null, totalLikes: { $sum: "$numLikes" } } }
      ]).toArray();

      const categoryStats = await artsCollection.aggregate([
        { $group: { _id: "$category", count: { $sum: 1 } } }
      ]).toArray();

      res.send({
        totalArts,
        totalUsers,
        totalLikes: likesStats[0]?.totalLikes || 0,
        categories: categoryStats
      });
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
