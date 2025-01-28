const express = require("express");
const cors = require("cors");
const app = express();
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);

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
    const paymentCollection = client
      .db("AssetManagement")
      .collection("payment");

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "5d",
      });
      res.send({ token });
    });

    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];

      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };


    const verifyLoginHRUser = async (req, res, next) => {
      const email = req.decoded.email;
      const user = await hrUsersCollection.findOne({ email });
      const isHR = user?.role === "HR";
      if (!isHR) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    const verifyLoginHRRequestUser = async (req, res, next) => {
      const email = req.decoded.email;
      const user = await hrUsersCollection.findOne({ email });
      // console.log("user", user);
      const isHR = user?.role === "HR_Request";
      if (!isHR) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // As an Employee

    // app.get("/myteam/:email", async(req,res)=>{
    //   const email = req.params.email
    //   const userData = await usersCollection.findOne({email})
    //   const result = await usersCollection.find({hr_email: userData.hr_email}).toArray()
    //   console.log("user", result)
    //   res.send(result)
    // })

    app.get("/employeeCompany/:email", async(req, res)=>{
      const email = req.params.email
      const userData = await usersCollection.findOne({email})
      const quary = {hr_email: userData?.hr_email}
      const result = await hrUsersCollection.findOne(quary)
      res.send(result)
    })

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
            $unwind: { path: "$hrusers" },
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
      res.send(result);
    });

    // hr==> add employee
    app.patch("/user/:email",verifyToken, verifyLoginHRUser, async (req, res) => {
      const email = req.params.email;
      const quary = { email };
      const userData = await usersCollection.findOne(quary);
      const updateUser = req.body;
      const hr = { email: updateUser?.hr_email };
      const info = await hrUsersCollection.findOne(hr);
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
      res.send(result);
    });

    // employee data fetch add employee route
    app.get("/employee/role/:email", async (req, res) => {
      const email = req.params.email;
      const quary = { email: email };
      const result = await usersCollection.findOne(quary);
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

    app.get(
      "/assetsrequest/:email",
      verifyToken,
      verifyLoginHRUser,
      async (req, res) => {
        const email = req.params.email;
        const search = req.query.search;
        const quary = {
          hr_email: email,
          $or: [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
          ],
        };
        const result = await EmployeeAssetCollection.find(quary).toArray();
        res.send(result);
      }
    );

  

    // Employee Home 
    app.get("/lastmonthrequest/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const query = {
      email,
      request_date: { $gte: oneMonthAgo.toISOString() }
    };
    const result = await EmployeeAssetCollection.find(query).toArray()
    console.log(result)
    res.send(result)
  });
  
    app.get("/toppending/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const query = {
      email,
      request_status: "Pending",
      request_date: { $gte: oneMonthAgo.toISOString() }
    };
    const result = await EmployeeAssetCollection.find(query).toArray()
    console.log(result)
    res.send(result)
  });
    app.get("/hrtoppending/:email", verifyToken, verifyLoginHRUser, async (req, res) => {
      const email = req.params.email;
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const query = {
      hr_email: email,
      request_status: "Pending",
      request_date: { $gte: oneMonthAgo.toISOString() }
    };
    const result = await EmployeeAssetCollection.find(query).toArray()
    console.log(result)
    res.send(result)
  });
  
  // add user
  app.patch('/addmultipleemployee', verifyToken, verifyLoginHRUser, async (req, res) => {
    const { ids, hr_email, role } = req.body;
    const objectIds = ids.map((id) => new ObjectId(id));
    const hr = { email: hr_email };
    const info = await hrUsersCollection.findOne(hr);
    if ((info.employee_limit - info.total_employee) < ids.length) {
        return res.status(400).json({ message: "No employees were updated." });
    }
    try {
      const result = await usersCollection.updateMany(
        { _id: { $in: objectIds } },  
        {
          $set: { role, hr_email}
        }
      );

      const updateHrlimit = {
        $inc: { total_employee: ids.length },
      };
      const hrReault = await hrUsersCollection.updateOne(hr, updateHrlimit);

      if (result.modifiedCount > 0) {
        res.status(200).json({ message: `${result.modifiedCount} employees updated successfully.` });
      } else {
        res.status(400).json({ message: "No employees were updated." });
      }
    } catch (error) {
      console.error("Error updating employees:", error);
      res.status(500).json({ message: "Error updating employees", error });
    }
  });



  app.get("/employeeapproveddata/:email", verifyToken, async(req,res)=>{
    const email = req.params.email
    const quary = {email: email,
      request_status: "Approved",
    }
    const result = await EmployeeAssetCollection.find(quary).toArray()
    res.send(result)
  })
  app.get("/employeependingdata/:email", verifyToken, async(req,res)=>{
    const email = req.params.email
    const quary = {email: email,
      request_status: "Pending",
    }
    const result = await EmployeeAssetCollection.find(quary).toArray()
    res.send(result)
  })
  app.get("/employeerejecteddata/:email", verifyToken, async(req,res)=>{
    const email = req.params.email
    const quary = {email: email,
      request_status: "Rejected",
    }
    const result = await EmployeeAssetCollection.find(quary).toArray()
    res.send(result)
  })
  app.get("/employeereturndata/:email", verifyToken, async(req,res)=>{
    const email = req.params.email
    const quary = {email: email,
      request_status: "Returned",
    }
    const result = await EmployeeAssetCollection.find(quary).toArray()
    res.send(result)
  })



    app.get("/myrequest/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const search = req.query.search;
      const type = req.query.type;
      const status = req.query.status;
      const quary = {
        email: email,
        ...(search && {
          $or: [{ product_name: { $regex: search, $options: "i" } }],
        }),
        ...(type && {
          product_type: type,
        }),
        ...(status && {
          request_status: status,
        }),
      };

      const result = await EmployeeAssetCollection.find(quary).toArray();
      res.send(result);
    });

    app.patch("/requestInfo/:id",verifyToken, verifyLoginHRUser, async (req, res) => {
      const id = req.params.id;
      const quary = { _id: new ObjectId(id) };
      const dataFind = await EmployeeAssetCollection.findOne(quary);
      const updateData = req.body;
      const assets_id = dataFind?.asset_id;
      const assets = { _id: new ObjectId(assets_id) };
      const quantityLimit = await assetCollection.findOne(assets);
      if (quantityLimit?.product_quantity == 0) {
        return res.send("error page");
      } else {
        const updateInfo = {
          $set: updateData,
        };
        const result = await EmployeeAssetCollection.updateOne(
          quary,
          updateInfo
        );
        const updateHrlimit = {
          $inc: {
            product_quantity: -1,
          },
        };
        const updateResult = await assetCollection.updateOne(
          assets,
          updateHrlimit
        );
        res.send(result);
      }
    });

    app.patch("/requestRejectInfo/:id",verifyToken, verifyLoginHRUser, async (req, res) => {
      const id = req.params.id;
      const quary = { _id: new ObjectId(id) };
      const updateData = req.body;
      const updateInfo = {
        $set: updateData,
      };
      const result = await EmployeeAssetCollection.updateOne(quary, updateInfo);
      // console.log(result, "vai tumi ki update hoccho?")
      res.send(result);
    });

    app.patch("/request/:id", verifyToken, async (req, res) => {
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
          product_quantity: 1,
        },
      };
      const updateResult = await assetCollection.updateOne(
        assets,
        updateHrlimit
      );
      res.send(result);
    });

    app.delete("/request/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await EmployeeAssetCollection.deleteOne(query);
      res.send(result);
    });

    app.post("/asset_request", async (req, res) => {
      const assetRequest = req.body;
      const result = await EmployeeAssetCollection.insertOne(assetRequest);
      res.send(result);
    });

    // hr  route manage

    //  route provide
    app.get("/hrusers/role/:email", async (req, res) => {
      const email = req.params.email;
      const result = await hrUsersCollection.findOne({ email });
      res.send({ role: result?.role });
    });

    app.get(
      "/employee/:email",
      verifyToken,
      async (req, res) => {
        const email = req.params.email;
        const quary = { hr_email: email, role: "Employee" };
        const result = await usersCollection.find(quary).toArray();
        res.send(result);
      }
    );

    // Hr join data save
    app.get(
      "/hremployee/:email",
      verifyToken,
      verifyLoginHRUser,
      async (req, res) => {
        const email = req.params.email;
        const result = await hrUsersCollection.findOne({ email });
        res.send(result);
      }
    );
       
    
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


    // add asset

    app.get("/allasset/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const userInfo = await usersCollection.findOne({ email });

        const search = req.query.search;
        const type = req.query.type;
        const availability = req.query.availability;

        const quary = {
          hr_email: userInfo?.hr_email,
          ...(search && {
            $or: [{ product_name: { $regex: search, $options: "i" } }],
          }),
          ...(type && {
            product_type: type,
          }),
        };
        if (availability) {
          if (availability === "0") {
            quary.product_quantity = 0;
          } else if (availability === "1") {
            quary.product_quantity = { $gte: 1 };
          }
        }

        const result = await assetCollection
          .find(quary).toArray();


      // console.log("Hellow result",result)
      res.send(result);
    });

    app.get(
      "/allassets/:email",
      verifyToken,
      async (req, res) => {
        const email = req.params.email;
        const search = req.query.search;
        const type = req.query.type;
        const quantity = req.query.quantity;
        const sort = req.query.sort;
        const quary = {
          hr_email: email,
          ...(search && {
            $or: [{ product_name: { $regex: search, $options: "i" } }],
          }),
          ...(type && {
            product_type: type,
          }),
        };
        if (quantity) {
          if (quantity === "0") {
            quary.product_quantity = 0;
          } else if (quantity === "1") {
            quary.product_quantity = { $gte: 1 };
          }
        }

        let sortQuery = {};
        if (sort == "true") {
          sortQuery.product_quantity = 1;
        } else if (sort == "false") {
          sortQuery.product_quantity = -1;
        }

        const result = await assetCollection
          .find(quary)
          .sort(sortQuery)
          .toArray();
        res.send(result);
      }
    );

    app.patch("/asset/:id", async (req, res) => {
      const id = req.params.id;
      const quary = { _id: new ObjectId(id) };
      const assetData = req.body;
      const updateData = {
        $set: assetData,
      };
      const result = await assetCollection.updateOne(quary, updateData);
      res.send(result);
    });


    app.patch("/hrUpdatePackage/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const quary = { email: email };
      const updatePackage = req.body;
      const updateData = {
        $set: updatePackage,
      };
      const result = await hrUsersCollection.updateOne(quary, updateData);
      res.send(result);
    });

    app.delete("/allassets/:id", verifyToken, verifyLoginHRUser, async (req, res) => {
      const id = req.params.id;
      const quary = { _id: new ObjectId(id) };
      const result = await assetCollection.deleteOne(quary);
      res.send(result);
    });

    app.post("/asset", verifyToken, verifyLoginHRUser, async (req, res) => {
      const data = req.body;
      const result = await assetCollection.insertOne(data);
      res.send(result);
    });

    //buy
    app.get("/totalPayment/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const result = await hrUsersCollection.findOne({ email });
      res.send(result);
    });
    app.get("/hrCompany/:email", async (req, res) => {
      const email = req.params.email;
      const result = await hrUsersCollection.findOne({ email });
      res.send(result);
    });

    app.get("/totalRequest/:email", verifyToken, verifyLoginHRUser, async(req, res)=>{
      const email = req.params.email
      const quary = {hr_email: email}
      const result = await EmployeeAssetCollection.find(quary).toArray()
      res.send(result)
    })
    app.get("/totalapproved/:email", verifyToken, verifyLoginHRUser, async(req, res)=>{
      try {
        const email = req.params.email;
        const query = {
            hr_email: email,
            request_status: "Approved",
        };
        const result = await EmployeeAssetCollection.find(query).toArray();
        res.status(200).send(result);
    } catch (error) {
        console.error("Error fetching approved requests:", error);
        res.status(500).send({ error: "Internal Server Error" });
    }
    })

    app.get("/totalrejected/:email", verifyToken, verifyLoginHRUser, async(req, res)=>{
      try {
        const email = req.params.email;
        const query = {
            hr_email: email,
            request_status: "Rejected",
        };
        const result = await EmployeeAssetCollection.find(query).toArray();
        res.status(200).send(result);
    } catch (error) {
        console.error("Error fetching approved requests:", error);
        res.status(500).send({ error: "Internal Server Error" });
    }
    })
    app.get("/totalreturned/:email", verifyToken, verifyLoginHRUser, async(req, res)=>{
      try {
        const email = req.params.email;
        const query = {
            hr_email: email,
            request_status: "Returned",
        };
        const result = await EmployeeAssetCollection.find(query).toArray();
        res.status(200).send(result);
    } catch (error) {
        res.status(500).send({ error: "Internal Server Error" });
    }
    })


app.get("/toprequest/:hr_email", verifyToken, verifyLoginHRUser, async(req, res)=>{
  const hr_email = req.params.hr_email
  const result = await EmployeeAssetCollection.aggregate([
    {
      $group: {
        _id: {
          hr_email: hr_email,
          product_name: "$product_name"
        },
        totalQuantity: { $sum: "$product_quantity" }
      }
    },
    {
      $group: {
        _id: "$_id.hr_email",
        products: {
          $push: {
            product_name: "$_id.product_name",
            totalQuantity: "$totalQuantity"
          }
        }
      }
    },
    {
      $unwind: "$products" 
    },
    {
      $sort: { "products.totalQuantity": -1 }
    },
    {
      $group: {
        _id: "$_id",
        products: { $push: "$products" }
      }
    },
    {
      $project: {
        _id: 0,
        products: 1
      }
    }
  ]).toArray();

  console.log(result, "this is result")
  res.send(result)
})

app.get("/limitedstock/:email", verifyToken, verifyLoginHRUser, async(req,res)=>{
  const email = req.params.email
  const quary = {hr_email: email,
    product_quantity: { $lt: 10 }
  }
  const sort = false
  let sortQuery = {};
  if (sort == false) {
    sortQuery.product_quantity = 1;
  }
  const result = await assetCollection.find(quary).sort(sortQuery).toArray()
  res.send(result)
})

app.get("/return/:email", verifyToken, verifyLoginHRUser, async(req,res)=>{
  const email = req.params.email
  console.log(email, "email dekhtechi")
  const quary = {hr_email: email,
    product_type: "Returnable",
  }
  const result = await assetCollection.find(quary).toArray()
  res.send(result)
})
app.get("/nonreturn/:email", verifyToken, verifyLoginHRUser, async(req,res)=>{
  const email = req.params.email
  const quary = {hr_email: email,
    product_type: "Non-returnable",
  }
  const result = await assetCollection.find(quary).toArray()
  res.send(result)
})
app.get("/approveddata/:email", verifyToken, verifyLoginHRUser, async(req,res)=>{
  const email = req.params.email
  const quary = {hr_email: email,
    request_status: "Approved",
  }
  const result = await EmployeeAssetCollection.find(quary).toArray()
  res.send(result)
})
app.get("/pendingdata/:email", verifyToken, verifyLoginHRUser, async(req,res)=>{
  const email = req.params.email
  const quary = {hr_email: email,
    request_status: "Pending",
  }
  const result = await EmployeeAssetCollection.find(quary).toArray()
  res.send(result)
})
app.get("/rejecteddata/:email", verifyToken, verifyLoginHRUser, async(req,res)=>{
  const email = req.params.email
  const quary = {hr_email: email,
    request_status: "Rejected",
  }
  const result = await EmployeeAssetCollection.find(quary).toArray()
  res.send(result)
})
app.get("/returndata/:email", verifyToken, verifyLoginHRUser, async(req,res)=>{
  const email = req.params.email
  const quary = {hr_email: email,
    request_status: "Returned",
  }
  const result = await EmployeeAssetCollection.find(quary).toArray()
  res.send(result)
})

app.get(
  "/hremployeelist/:email",
  async (req, res) => {
    const email = req.params.email;
    const quary ={hr_email: email}
    const result = await usersCollection.find(quary).toArray();
    res.send(result);
  }
);
    // payment
    app.post("/create-payment-intent", async (req, res) => {
      const { quantity, plantId } = req.body;
      const { email } = req.body;
      const findData = await hrUsersCollection.findOne({ email });
      // console.log(findData, "findDAta");
      const package = findData?.package;
      // console.log(package, "findinfo");

      const totalPrice = package * 100;
      const { client_secret } = await stripe.paymentIntents.create({
        amount: totalPrice,
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
      });
      res.send({ clientSecret: client_secret, total: totalPrice });
    });

    app.post("/order", async (req, res) => {
      const { transactionId, name, email, limit } = req.body;
      const paymentData = {
        transactionId,
        name,
        email,
      };
      const result = await paymentCollection.insertOne(paymentData);
      const query = { email };
      const updateData = {
        $set: {
          role: "HR",
        },
        $inc: {
          employee_limit: limit,
        },
      };
      const updateHR = await hrUsersCollection.updateOne(query, updateData);
      // console.log(result, "Hr role");
      res.send(result);
    });

    // await client.connect();
    // // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
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
