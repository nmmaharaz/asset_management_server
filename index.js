const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vh6jx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const usersCollection = client.db("AssetManagement").collection("users");
    const EmployeeAssetCollection = client
      .db("AssetManagement")
      .collection("requestassets");
    const hrUsersCollection = client
      .db("AssetManagement")
      .collection("hrusers");
    const assetCollection = client.db("AssetManagement").collection("asset");

    // As an Employee

    // app.get("/myteam/:email", async(req,res)=>{
    //   const email = req.params.email
    //   const userData = await usersCollection.findOne({email})
    //   const result = await usersCollection.find({hr_email: userData.hr_email}).toArray()
    //   console.log("user", result)
    //   res.send(result)
    // })

    app.get("/myteam/:email", async (req, res) => {
      const email = req.params.email;
      const userData = await usersCollection.findOne({ email });
      const hr_email = userData.hr_email;
      const result = await usersCollection
        .aggregate([
          {
            $match: { hr_email },
          },
          {
            $addFields: { hr_email },
          },
          {
            $lookup: {
              from: "hrusers",
              localField: "hr_email",
              foreignField: "email",
              as: "hrusers",
            },
          },
          {
            $unwind: { path: "$hrusers",  },
          },
          {
            $addFields: {
              company_name: "$hrusers.company_name",
              company_logo: "$hrusers.company_logo",
            },
          },
          {
            $project: {
              hrusers: 0,
            },
          },
        ])
        .toArray();
      console.log("user", result);
      res.send(result);
    });

    // hr==> add employee
    app.patch("/user/:email", async (req, res) => {
      const email = req.params.email;
      const quary = { email };
      const userData = await usersCollection.findOne(quary);
      // console.log(email, "this is email.klfdjsdj");
      const updateUser = req.body;
      // console.log(updateUser?.hr_email);
      const hr = { email: updateUser?.hr_email };
      // const info = await hrUsersCollection.findOne(hr);
      if (info.employee_limit == info.total_employee) {
        return res.send("Limit nei");
      } else {
        if (userData?.role == "Employee") {
          return res.send("vai tumi already employee");
        } else {
          const updateRule = {
            $set: updateUser,
          };
          const result = await usersCollection.updateOne(quary, updateRule);

          const updateHrlimit = {
            $inc: { total_employee: 1 },
          };
          const hrReault = await hrUsersCollection.updateOne(hr, updateHrlimit);
          res.send(result);
        }
      }
    });
    // remove employee my team
    app.patch("/removeteam/:email", async (req, res) => {
      const email = req.params.email;
      const quary = { email };
      const updateUser = req.body;
      const userInfo = await usersCollection.findOne(quary);
      // console.log("console log korcho",userInfo?.hr_email)
      const hr = { email: userInfo?.hr_email };
      const info = await hrUsersCollection.findOne(hr);
      const updateRule = {
        $set: updateUser,
      };
      const result = await usersCollection.updateOne(quary, updateRule);
      const updateHrlimit = {
        $inc: {
          total_employee: -1,
        },
      };
      const hrReault = await hrUsersCollection.updateOne(hr, updateHrlimit);
      // console.log(hrReault)
      res.send(result);
    });

    // employee data fetch add employee route
    app.get("/employee/role/:email", async (req, res) => {
      const email = req.params.email;
      const quary = { email: email };
      // console.log(email, quary)
      const result = await usersCollection.findOne(quary);
      // console.log(result)
      res.send({ role: result?.role });
    });

    app.get("/addemployee", async (req, res) => {
      const quary = { role: "User" };
      const result = await usersCollection.find(quary).toArray();
      res.send(result);
    });

    // employee join data data
    app.post("/users/:email", async (req, res) => {
      const email = req.params.email;
      const quary = { email };
      const data = req.body;
      const addedData = await usersCollection.findOne(quary);
      if (addedData) return res.send("data all added db");
      const result = await usersCollection.insertOne({
        ...data,
        hr_email: "",
        role: "User",
      });
      res.send(result);
    });

    // Employee Assets Request

    app.get("/assetsrequest/:email", async(req, res)=>{
      const email = req.params.email
      const quary = {hr_email: email}
      const result = await EmployeeAssetCollection.find(quary).toArray()
      res.send(result)
    })
    app.get("/myrequest/:email", async (req, res) => {
      const email = req.params.email;
      const result = await EmployeeAssetCollection.find({ email }).toArray();
      // console.log("this is a r", result)
      res.send(result);
    });

    

    app.patch("/request/:id", async (req, res) => {
      const id = req.params.id;
      const quary = { _id: new ObjectId(id) };
      const dataFind = await EmployeeAssetCollection.findOne(quary);
      const assets_id = dataFind?.asset_id;
      const updateData = req.body;
      const assets = { _id: new ObjectId(assets_id) };
      const tumi = await assetCollection.findOne(assets);
      const update = {
        $set: { request_status: updateData.request_status },
      };
      const result = await EmployeeAssetCollection.updateOne(quary, update);
      const updateHrlimit = {
        $inc: {
          product_quantity: -1,
        },
      };
      const updateResult = await assetCollection.updateOne(
        assets,
        updateHrlimit
      );
      // console.log(updateResult, "limit")
      res.send(result);
    });

    app.post("/asset_request", async (req, res) => {
      const assetRequest = req.body;
      const result = await EmployeeAssetCollection.insertOne(assetRequest);
      // console.log("this is a r", result)
      res.send(result);
    });

    // hr  route manage

    //  route provide
    app.get("/hrusers/role/:email", async (req, res) => {
      const email = req.params.email;
      const result = await hrUsersCollection.findOne({ email });
      res.send({ role: result?.role });
    });

    app.get("/employee/:email", async (req, res) => {
      const email = req.params.email;
      const quary = { hr_email: email, role: "Employee" };
      const result = await usersCollection.find(quary).toArray();
      // res.send({ role: result?.role });
      // console.log("this is result", result);
      res.send(result);
    });

    // Hr join data save
    app.get("/hremployee/:email", async (req, res) => {
      const email = req.params.email;
      const result = await hrUsersCollection.findOne({ email });
      // console.log(result, "tumi hr")
      res.send(result);
    });
    app.post("/hrusers/:email", async (req, res) => {
      const email = req.params.email;
      const quary = { email };
      const data = req.body;
      const addedData = await hrUsersCollection.findOne(quary);
      if (addedData) return res.send("data all added db");
      const result = await hrUsersCollection.insertOne({
        ...data,
        employee_limit: 5,
        total_employee: 0,
        role: "HR_Request",
      });
      res.send(result);
    });

    // Asset Releted

    // add asset

    

    app.get("/allasset/:email", async (req, res) => {
      const email = req.params.email;
      const userInfo = await usersCollection.findOne({ email });
      // console.log(result.hr_email, "all asset hr email")
      const quary = { hr_email: userInfo.hr_email };
      const result = await assetCollection.find(quary).toArray();
      // console.log("Hellow result",result)
      res.send(result);
    });

    app.get("/allassets/:email", async (req, res) => {
      const email = req.params.email;
      const quary = { hr_email: email };
      const result = await assetCollection.find(quary).toArray();
      // console.log("Hellow result",result)
      res.send(result);
    });

    app.patch("/asset/:id", async (req, res) => {
      const id = req.params.id;
      const quary = { _id: new ObjectId(id) };
      const assetData = req.body;
      const updateData = {
        $set: assetData,
      };
      const result = await assetCollection.updateOne(quary, updateData);
      // console.log(result, "vai tumi ki update hoccho?")
      res.send(result);
    });

    app.delete("/allassets/:id", async (req, res) => {
      const id = req.params.id;
      const quary = { _id: new ObjectId(id) };
      const result = await assetCollection.deleteOne(quary);
      // console.log("Hellow result",result)
      res.send(result);
    });

    app.post("/asset", async (req, res) => {
      const data = req.body;
      const result = await assetCollection.insertOne(data);
      // console.log(result)
      res.send(result);
    });

    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Asset_Managetment");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
