const http = require("http");
const https = require("https");
const fs = require("fs");
const client = require("./connection");
const express = require("express");
const app = express();
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config();

require("./controllers/CronJobs.js"); // Adjust path if cron.js is in a different directory, e.g., "./src/cron"

const districtRoutes = require("./routes/districtRoutes");
const stationRoutes = require("./routes/stationRoutes");
const stateRoutes = require("./routes/stateRoutes");
const subDivisionRoutes = require("./routes/subDivisionRoutes");
const regionRoutes = require("./routes/regionRoutes");
const countryRoutes = require("./routes/countryRoutes");
const centreRoutes = require("./routes/centreRoutes");
const emailRoutes = require("./routes/emailRoutes");
const pdfRoutes = require("./routes/pdfRoutes");
const resetPassRoutes = require("./routes/resetPassRoutes");
const blockRoutes = require("./routes/blockRoutes");
const mapImageRoutes = require("./routes/mapImageRoutes");
const spatialDistribution = require("./routes/spatialDistributionRoutes");
const awsRoutes = require("./routes/awsRoutes");
const awsRealtimeRoutes = require("./routes/awsRealtimeRoutes");
const adminRoutes = require("./routes/adminpanelRoutes");
const geojsonRoutes = require("./routes/geojsonRoutes");
const stationDashboardRoutes = require("./routes/stationDashboardRoutes");
const calculationsModeRoutes = require("./routes/calculationsModeRoutes");
const dbInfoRoutes = require("./routes/dbInfoRoutes");
const cronScheduleRoutes = require("./routes/cronScheduleRoutes");
const dataEntryLockRoutes = require("./routes/dataEntryLockRoutes");
const mapDataScheduleRoutes = require("./routes/mapDataScheduleRoutes");
const topRainfallStationsRoutes = require("./routes/topRainfallStationsRoutes");
const reviewPublishRoutes = require("./routes/reviewPublishRoutes");
const adminActivityLogRoutes = require("./routes/adminActivityLogRoutes");
const officerPassKeyRoutes = require("./routes/officerPassKeyRoutes");
const rbacRoutes = require("./routes/rbacRoutes");
const routeAccessRoutes = require("./routes/routeAccessRoutes");
const { initAdminRealtime } = require("./utils/adminRealtime");
const tapiBasinRoutes = require("./routes/tapiBasinRoutes");
const ollamaChatRoutes = require("./routes/ollamaChatRoutes");
const rainfallChatRoutes = require("./routes/rainfallChatRoutes");
const allStatisticsRoutes = require("./routes/allStatisticsRoutes");

const SSL_KEY_PATH = process.env.SSL_KEY_PATH || "/etc/apache2/private.key";
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || "/etc/apache2/*.imd.gov.in.crt";
const SSL_CA_PATH = process.env.SSL_CA_PATH || "/etc/apache2/emSign-SSL-CA-G1.crt";

const sslFilesExist = () =>
    fs.existsSync(SSL_KEY_PATH) &&
    fs.existsSync(SSL_CERT_PATH) &&
    fs.existsSync(SSL_CA_PATH);

const loadSslOptions = () => ({
    key: fs.readFileSync(SSL_KEY_PATH),
    cert: fs.readFileSync(SSL_CERT_PATH),
    ca: fs.readFileSync(SSL_CA_PATH),
});

app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );
  next();
});

// Generate JWT Secret Key
const generateSecretKey = () => {
  return crypto.randomBytes(32).toString("hex");
};

const secretKey = generateSecretKey();

const verifyLoginPassword = async (plainPassword, storedPassword) => {
  if (!storedPassword) return false;
  if (/^\$2[aby]\$/.test(storedPassword)) {
    return bcrypt.compare(plainPassword, storedPassword);
  }
  return plainPassword === storedPassword;
};

app.post("/login", async (req, res) => {
  try {
    const username = String(req.body.username ?? req.body.email ?? "").trim();
    const password = req.body.password ?? "";

    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    const result = await client.query(
      `SELECT userid, name, username, password, mcorhq, status
       FROM login
       WHERE username = $1`,
      [username]
    );

    if (!result.rows.length) {
      return res.send({ message: "Username and Password are Invalid" });
    }

    let matchedUser = null;
    for (const row of result.rows) {
      if (row.status != null && Number(row.status) !== 1) continue;
      if (await verifyLoginPassword(password, row.password)) {
        matchedUser = row;
        break;
      }
    }

    if (!matchedUser) {
      return res.send({ message: "Username and Password are Invalid" });
    }

    const { password: _pw, ...userData } = matchedUser;
    const user = { userName: username };

    jwt.sign({ user }, secretKey, { expiresIn: "300s" }, (err, token) => {
      if (err) {
        return res.status(500).json({ message: "Server Error", error: err.message });
      }
      res.json({
        message: "Login successful",
        token,
        data: [userData],
      });
    });
  } catch (err) {
    console.error("[LOGIN]", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

const port = process.env.PORT || 3000;

app.use("/api/v1/", regionRoutes);
app.use("/api/v1/", districtRoutes);
app.use("/api/v1/", stationRoutes);
app.use("/api/v1/", stateRoutes);
app.use("/api/v1/", subDivisionRoutes);
app.use("/api/v1/", regionRoutes);
app.use("/api/v1/", countryRoutes);
app.use("/api/v1/", centreRoutes);
app.use("/api/v1/", emailRoutes);
app.use("/api/v1/", pdfRoutes);
app.use("/api/v1/", resetPassRoutes);
app.use("/api/v1/", blockRoutes);
app.use("/api/v1/maps/", mapImageRoutes);
app.use("/api/v1/", spatialDistribution);
app.use("/api/v1/", awsRoutes);
app.use("/api/v1/", awsRealtimeRoutes);
app.use("/api/v1/", adminRoutes);
app.use("/api/v1/", geojsonRoutes);
app.use("/api/v1/", stationDashboardRoutes);
app.use("/api/v1/", calculationsModeRoutes);
app.use("/api/v1/", dbInfoRoutes);
app.use("/api/v1/", cronScheduleRoutes);
app.use("/api/v1/", dataEntryLockRoutes);
app.use("/api/v1/", mapDataScheduleRoutes);
app.use("/api/v1/", topRainfallStationsRoutes);
app.use("/api/v1/", reviewPublishRoutes);
app.use("/api/v1/", adminActivityLogRoutes);
app.use("/api/v1/", officerPassKeyRoutes);
app.use("/api/v1/", rbacRoutes);
app.use("/api/v1/", routeAccessRoutes);
app.use("/api/v1/", tapiBasinRoutes);
app.use("/api/v1/", rainfallChatRoutes);
app.use("/api/v1/", ollamaChatRoutes);
app.use("/api/v1/", allStatisticsRoutes);

const useHttps = process.env.USE_HTTPS === "true" || (process.env.USE_HTTPS !== "false" && sslFilesExist());

const server = useHttps
  ? https.createServer(loadSslOptions(), app)
  : http.createServer(app);

initAdminRealtime(server);

server.listen(port, () => {
  if (useHttps) {
    console.log(`Secure HTTPS Server started at PORT ${port} (WebSocket: /socket.io)`);
  } else {
    console.log(`HTTP Server started at http://localhost:${port} (WebSocket: /socket.io)`);
  }

  const {
    warmupCatalogIntoModel,
  } = require("./controllers/ollamaChat/chatService");
  warmupCatalogIntoModel()
    .then((warm) => {
      if (!warm.ready) {
        console.warn(
          "[ollama-chat] warmup not ready:",
          warm.error || warm.status
        );
        return;
      }
      const rag = warm.rag || {};
      if (rag.ready) {
        console.log(
          `[ollama-chat] ready — RAG index ${rag.chunk_count} chunks ` +
            `(${rag.embed_model}), num_ctx ${warm.num_ctx}` +
            (rag.stale ? "  [STALE: run npm run rag:build]" : "")
        );
      } else {
        // Without the index the planner falls back to stuffing the whole
        // catalog, which only works if num_ctx is large enough to hold it.
        console.warn(
          `[ollama-chat] ready WITHOUT RAG index (${rag.error}). ` +
            `Falling back to full-catalog prompts: ${warm.full_catalog_prompt_tokens} tokens ` +
            `vs num_ctx ${warm.num_ctx} — ` +
            (warm.full_catalog_fits
              ? "fits, but slower per question. Run: npm run rag:build"
              : "DOES NOT FIT, the catalog will be truncated and the planner will invent endpoints. Run: npm run rag:build")
        );
      }
    })
    .catch((err) => {
      console.warn("[ollama-chat] warmup skipped:", err.message);
    });
});

client.connect();
