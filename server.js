const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5001;
// Trust Render/Cloudflare proxy for secure cookies
app.set("trust proxy", 1);
// External/base URL (Render sets RENDER_EXTERNAL_URL in prod)
const BASE_URL =
  process.env.PUBLIC_BASE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  `http://localhost:${port}`;
/* ------------------------------------------------------------------ */
/*  Helmet baseline                                                    */
/* ------------------------------------------------------------------ */
app.use(
  helmet({
    referrerPolicy: { policy: "no-referrer" },
    crossOriginResourcePolicy: { policy: "same-origin" }, // aligns with your observed headers
    // frameguard SAMEORIGIN is enabled by default; also enforced via CSP below
  })
);
// Extra protections
app.use(helmet.noSniff());
app.use(
  helmet.hsts({
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  })
);
/* ------------------------------------------------------------------ */
/*  CSP with per-request NONCE                                         */
/* ------------------------------------------------------------------ */
// Generate a per-request nonce
app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString("base64");
  next();
});
// Global CSP header (covers JSON, static files, etc.)
app.use((req, res, next) => {
  const nonce = res.locals.cspNonce;
  const s3Origin =
    process.env.S3_BUCKET_NAME && process.env.AWS_REGION
      ? `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com`
      : null;
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://cdn.jsdelivr.net https://cdn.tailwindcss.com https://apis.scrimba.com 'sha256-ZswfTY7H35rbv8WC7NXBoiC7WNu86vSzCDChNWwZZDM='`,
    `style-src 'self' 'nonce-${nonce}' https://cdn.jsdelivr.net https://cdn.tailwindcss.com`,
    `img-src 'self' data: https://upload.wikimedia.org https://ucarecdn.com${s3Origin ? " " + s3Origin : ""}`,
    `connect-src 'self' https://apis.scrimba.com`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
    "upgrade-insecure-requests",
    "font-src 'self' data:",
    "form-action 'self'",
    "script-src-attr 'none'",
    "style-src-attr 'none'",
  ].join("; ");
  res.setHeader("Content-Security-Policy", csp);
  next();
});
/* ------------------------------------------------------------------ */
/*  HTML routes that inject NONCE into <script> and <style>            */
/* ------------------------------------------------------------------ */
const HTML_ROUTES = ["/login", "/login.html"];
app.get(HTML_ROUTES, (req, res, next) => {
  let file = req.path === "/" ? "index.html" : req.path.replace(/^\//, "");
  // Ensure we resolve to an actual HTML file (e.g. '/login' -> 'login.html')
  if (!path.extname(file)) {
    file = `${file}.html`;
  }
  const filePath = path.join(__dirname, "public", file);
  fs.readFile(filePath, "utf8", (err, html) => {
    if (err) return next(err);
    const nonce = res.locals.cspNonce;
    // Add nonce to inline <script> tags that do NOT have a src
    let withScriptNonces = html.replace(
      /<script\b(?![^>]*\bsrc=)([^>]*)>/gi,
      `<script nonce="${nonce}"$1>`
    );
    // Add nonce to inline <style> tags
    withScriptNonces = withScriptNonces.replace(
      /<style\b([^>]*)>/gi,
      `<style nonce="${nonce}"$1>`
    );
    // Inject a small runtime helper (nonce-protected) that converts
    // inline style attributes (which CSP blocks) into class-based rules
    // stored in a nonce-protected <style> element. This lets vendor
    // scripts set element.style=... while the browser applies styles
    // from the external stylesheet (which is allowed by CSP via nonce).
    const styleInject = `<style nonce="${nonce}" id="csp-stylefix"></style>`;

    const helperScript = `<script nonce="${nonce}">(function(){
  try{
    var styleEl = document.getElementById('csp-stylefix');
    if(!styleEl) return;
    var ruleCounter=0;
    function makeClassFromStyle(styleText){
      ruleCounter++;
      var className='csp-style-fix-'+ruleCounter;
      var sheet = styleEl.sheet;
      try{
        // Insert the rule into the stylesheet
        sheet.insertRule('.'+className+'{'+styleText+'}', sheet.cssRules.length);
      }catch(e){
        // If insertRule fails (some browsers), skip adding the rule to avoid
        // building code that may introduce runtime parse issues. The element
        // will still get the generated class, but the rule may be missing.
      }
      return className;
    }

    function convertElement(el){
      if(!el || !el.getAttribute) return;
      if(el.dataset && el.dataset.cspFixed) return;
      var st = el.getAttribute('style');
      if(st && st.trim()){
        var cls = makeClassFromStyle(st);
        el.classList.add(cls);
        el.removeAttribute('style');
        if(el.dataset) el.dataset.cspFixed = '1';
      }
    }

    // Convert existing elements with style attributes
    var existing = document.querySelectorAll('[style]');
    for(var i=0;i<existing.length;i++){ convertElement(existing[i]); }

    // Observe future changes (e.g., vendor scripts adding style attributes)
    var mo = new MutationObserver(function(mutations){
      mutations.forEach(function(m){
        if(m.type==='attributes' && m.attributeName==='style'){
          convertElement(m.target);
        }
        if(m.type==='childList' && m.addedNodes && m.addedNodes.length){
          for(var j=0;j<m.addedNodes.length;j++){
            var node=m.addedNodes[j];
            if(node.nodeType===1){ // element
              // convert the node itself
              convertElement(node);
              // and any descendants
              var desc = node.querySelectorAll && node.querySelectorAll('[style]') || [];
              for(var k=0;k<desc.length;k++) convertElement(desc[k]);
            }
          }
        }
      });
    });
    mo.observe(document.documentElement || document.body, { attributes:true, childList:true, subtree:true, attributeFilter:['style'] });
  }catch(err){ console.error('CSP style-fix helper error', err); }
})();</script>`;

    // Early error suppression script to catch noisy extension SyntaxErrors
    // Inject into the <head> so it runs before extension-injected scripts.
    const headSuppress = `<script nonce="${nonce}">(function(){try{window.addEventListener('error',function(e){try{var msg=e&&(e.message||'');var src=e&&(e.filename||(e.error&&e.error.fileName)||'');if(typeof msg==='string'&& msg.indexOf('string literal contains an unescaped line break')!==-1&& typeof src==='string'&& src.indexOf('chrome-extension://')===0){if(e.preventDefault) e.preventDefault();console.debug('Suppressed extension SyntaxError from',src);return true;}}catch(ex){}},true);}catch(err){} })();</script>`;

    // Insert the early suppressor into <head> (if present), then add the
    // style/helper before </body>.
    let injected = withScriptNonces;
    if (/<head[^>]*>/i.test(injected)) {
      injected = injected.replace(/<head[^>]*>/i, function (m) {
        return m + headSuppress;
      });
    } else {
      // fallback: prepend to document
      injected = headSuppress + injected;
    }

    injected = injected.replace(
      /<\/body>/i,
      styleInject + helperScript + "</body>"
    );
    res.type("html").send(injected);
  });
});

/* ------------------------------------------------------------------ */
/*  Rate Limiter for Export (GET /tasks)                               */
/* ------------------------------------------------------------------ */
const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each user to 5 requests per hour
  message: {
    status: "error",
    code: 429,
    message: "Too many export requests, please try again after an hour.",
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator: (req, res) => {
    // Use the user's ID from the JWT to key the rate limit
    return req.user ? req.user.id : req.ip;
  },
});

/* ------------------------------------------------------------------ */
/*  Middleware & Auth                                                  */
/* ------------------------------------------------------------------ */
app.use(bodyParser.json());
app.use(
  cors({
    origin: [BASE_URL, "http://localhost:3000"],
    credentials: true,
  })
);
// Serve static files but DO NOT auto-index (we render HTML ourselves above)
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your_secret_key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());
app.use(cookieParser());
/* ------------------------------------------------------------------ */
/*  Mongo                                                              */
/* ------------------------------------------------------------------ */
const mongoUri = process.env.MONGODB_URI || "mongodb://mongo:27017/todo_db";
mongoose
  .connect(mongoUri)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));
/* ------------------------------------------------------------------ */
/*  JWT guard                                                          */
/* ------------------------------------------------------------------ */
// Replace the whole authenticateJWT with this
const authenticateJWT = async (req, res, next) => {
  const token = req.cookies.token;
  const wantsJson = req.accepts("json") || req.path.startsWith("/api/");

  if (!token) {
    return wantsJson
      ? res.status(401).json({ status: "error", code: 401, message: "Unauthorized. Please log in." })
      : res.redirect("/login");
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return wantsJson
      ? res.status(403).json({ status: "error", code: 403, message: "Forbidden. Invalid or expired token." })
      : res.redirect("/login");
  }

  try {
    // CRITICAL: re-check that the user still exists
    const dbUser = await User.findById(payload.id).select("role");
    if (!dbUser) {
      return wantsJson
        ? res.status(401).json({ status: "error", code: 401, message: "Account deleted or disabled." })
        : res.redirect("/login");
    }

    // Set a clean, trusted req.user (don’t rely on token role alone)
    req.user = { id: dbUser._id.toString(), role: dbUser.role };
    next();
  } catch (err) {
    console.error("Auth DB check error:", err);
    return wantsJson
      ? res.status(500).json({ status: "error", code: 500, message: "Server error during authentication." })
      : res.redirect("/login");
  }
};
/* ------------------------------------------------------------------ */
/*  Models                                                             */
/* ------------------------------------------------------------------ */
const userSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  displayName: String,
  email: String,
  role: { type: String, enum: ["user", "admin"], default: "user" },
  consentGiven: { type: Boolean, default: false },
  consentTimestamp: { type: Date },
  consentPolicyVersion: { type: String },
});

userSchema.pre(
  "deleteOne",
  { document: true, query: false },
  async function (next) {
    try {
      // `this` is the user document being removed.
      // Delete all tasks where the userId matches this user's ID.
      await mongoose.model("Task").deleteMany({ userId: this._id });
      next();
    } catch (err) {
      next(err);
    }
  }
);

const taskSchema = new mongoose.Schema({
  text: { type: String, required: true },
  completed: { type: Boolean, default: false },
  lastUpdated: { type: Date, default: Date.now },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
});
const User = mongoose.model("User", userSchema);
const Task = mongoose.model("Task", taskSchema);
/* ------------------------------------------------------------------ */
/*  RBAC helper                                                        */
/* ------------------------------------------------------------------ */
const checkRole = (role) => (req, res, next) => {
  if (req.user.role !== role) {
    if (req.accepts("html")) {
      return res.status(403).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Access Denied</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-gray-900 text-white flex justify-center items-center min-h-screen">
          <div class="max-w-md w-full p-8 bg-gray-800 rounded-lg shadow-lg text-center">
            <h1 class="text-3xl font-bold mb-4">Access Denied</h1>
            <p class="mb-6">You do not have permission to view this page.</p>
            <a href="/" class="bg-blue-500 hover:opacity-80 text-white py-2 px-4 rounded">Return</a>
          </div>
        </body>
        </html>
      `);
    }
    return res
      .status(403)
      .json({ message: "Forbidden: You do not have permission" });
  }
  next();
};

// Admin HTML with nonce injection
app.get("/admin-dashboard.html",
  authenticateJWT,
  checkRole("admin"),
  (req, res, next) => {
    const filePath = path.join(__dirname, "public", "admin-dashboard.html");
    fs.readFile(filePath, "utf8", (err, html) => {
      if (err) return next(err);
      const nonce = res.locals.cspNonce;

      let out = html
        .replace(/<script\b(?![^>]*\bsrc=)([^>]*)>/gi, `<script nonce="${nonce}"$1>`)
        .replace(/<style\b([^>]*)>/gi, `<style nonce="${nonce}"$1>`);

      const styleInject = `<style nonce="${nonce}" id="csp-stylefix"></style>`;
      const headSuppress = `<script nonce="${nonce}">(function(){try{window.addEventListener('error',function(e){try{var msg=e&&(e.message||'');var src=e&&(e.filename||(e.error&&e.error.fileName)||'');if(typeof msg==='string'&& msg.indexOf('string literal contains an unescaped line break')!==-1&& typeof src==='string'&& src.indexOf('chrome-extension://')===0){if(e.preventDefault) e.preventDefault();console.debug('Suppressed extension SyntaxError from',src);return true;}}catch(ex){}},true);}catch(err){} })();</script>`;
      const helperScript = `<script nonce="${nonce}">(function(){try{var s=document.getElementById('csp-stylefix');if(!s)return;})();</script>`;

      if (/<head[^>]*>/i.test(out)) out = out.replace(/<head[^>]*>/i, m => m + headSuppress);
      else out = headSuppress + out;

      out = out.replace(/<\/body>/i, styleInject + helperScript + "</body>");
      res.type("html").send(out);
    });
  }
);

// Clean redirect to the HTML file
app.get("/admin/dashboard",
  authenticateJWT,
  checkRole("admin"),
  (req, res) => res.redirect("/admin-dashboard.html")
);

// Protected index with nonce injection
app.get(["/", "/index.html"], authenticateJWT, (req, res, next) => {
  const filePath = path.join(__dirname, "public", "index.html");
  fs.readFile(filePath, "utf8", (err, html) => {
    if (err) return next(err);
    const nonce = res.locals.cspNonce;

    let out = html
      .replace(/<script\b(?![^>]*\bsrc=)([^>]*)>/gi, `<script nonce="${nonce}"$1>`)
      .replace(/<style\b([^>]*)>/gi, `<style nonce="${nonce}"$1>`);

    const styleInject = `<style nonce="${nonce}" id="csp-stylefix"></style>`;
    const headSuppress = `<script nonce="${nonce}">(function(){try{window.addEventListener('error',function(e){try{var msg=e&&(e.message||'');var src=e&&(e.filename||(e.error&&e.error.fileName)||'');if(typeof msg==='string'&& msg.indexOf('string literal contains an unescaped line break')!==-1&& typeof src==='string'&& src.indexOf('chrome-extension://')===0){if(e.preventDefault) e.preventDefault();console.debug('Suppressed extension SyntaxError from',src);return true;}}catch(ex){}},true);}catch(err){} })();</script>`;
    const helperScript = `<script nonce="${nonce}">(function(){try{var s=document.getElementById('csp-stylefix');if(!s)return;})();</script>`;

    if (/<head[^>]*>/i.test(out)) out = out.replace(/<head[^>]*>/i, m => m + headSuppress);
    else out = headSuppress + out;

    out = out.replace(/<\/body>/i, styleInject + helperScript + "</body>");
    res.type("html").send(out);
  });
});

app.use(express.static(path.join(__dirname, "public"), { index: false }));

/* ------------------------------------------------------------------ */
/*  Passport (Google OAuth)                                            */
/* ------------------------------------------------------------------ */
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${BASE_URL}/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ googleId: profile.id });
        const email = profile.emails?.[0]?.value;
        if (!user) {
          user = await new User({
            googleId: profile.id,
            displayName: profile.displayName,
            email,
            role: email === "lr.jesperas@mmdc.mcl.edu.ph" ? "admin" : "user",
          }).save();
        } else if (
          email === "lr.jesperas@mmdc.mcl.edu.ph" &&
          user.role !== "admin"
        ) {
          user.role = "admin";
          await user.save();
        }
        done(null, user);
      } catch (err) {
        done(err, null);
      }
    }
  )
);
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    if (user) return done(null, { id: user._id, role: user.role });
    return done(null, false);
  } catch (err) {
    return done(err, null);
  }
});
/* ------------------------------------------------------------------ */
/*  Auth routes                                                        */
/* ------------------------------------------------------------------ */
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);
app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    const token = jwt.sign(
      { id: req.user._id, role: req.user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
    });
    // Redirect based on consent status
    if (req.user.consentGiven) {
      return res.redirect("/");
    } else {
      return res.redirect("/consent");
    }
  }
);
app.post("/auth/logout", authenticateJWT, (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ message: "Logout error" });
    req.session.destroy(() => {
      res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
      });
      return res.status(204).end();
    });
  });
});
app.get("/logout", authenticateJWT, (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).send("Logout error");
    req.session.destroy(() => {
      res.clearCookie("token");
      res.redirect("/login");
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Consent Routes                                                     */
/* ------------------------------------------------------------------ */

app.post('/api/consent', authenticateJWT, async (req, res) => {
  try {
    const { accepted = true, policyVersion = 'v1.0' } = req.body || {};
    if (!accepted) return res.status(400).json({ message: 'Consent not accepted.' });

    await User.findByIdAndUpdate(req.user.id, {
      consentGiven: true,
      consentTimestamp: new Date(),
      consentPolicyVersion: policyVersion
    });

    // No body necessary; client can redirect to "/"
    return res.status(204).end();
  } catch (e) {
    console.error('Consent save error:', e);
    return res.status(500).json({ message: 'Server error saving consent.' });
  }
});

app.get("/consent", authenticateJWT, async (req, res, next) => {
  try {
    const u = await User.findById(req.user.id).select("consentGiven");
    if (u?.consentGiven) {
      return res.redirect("/");
    }
  } catch (e) {
    // If DB check fails, we still render the consent page below
  }
    
  const filePath = path.join(__dirname, "public", "consent.html");
  fs.readFile(filePath, "utf8", (err, html) => {
    if (err) return next(err);
    const nonce = res.locals.cspNonce;

    let out = html
      .replace(/<script\b(?![^>]*\bsrc=)([^>]*)>/gi, `<script nonce="${nonce}"$1>`)
      .replace(/<style\b([^>]*)>/gi, `<style nonce="${nonce}"$1>`);

    const styleInject = `<style nonce="${nonce}" id="csp-stylefix"></style>`;
    const headSuppress = `<script nonce="${nonce}">(function(){try{window.addEventListener('error',function(e){try{var msg=e&&(e.message||'');var src=e&&(e.filename||(e.error&&e.error.fileName)||'');if(typeof msg==='string'&& msg.indexOf('string literal contains an unescaped line break')!==-1&& typeof src==='string'&& src.indexOf('chrome-extension://')===0){if(e.preventDefault) e.preventDefault();console.debug('Suppressed extension SyntaxError from',src);return true;}}catch(ex){}},true);}catch(err){} })();</script>`;
    const helperScript = `<script nonce="${nonce}">(function(){try{var s=document.getElementById('csp-stylefix');if(!s)return;})();</script>`;

    if (/<head[^>]*>/i.test(out)) out = out.replace(/<head[^>]*>/i, m => m + headSuppress);
    else out = headSuppress + out;

    out = out.replace(/<\/body>/i, styleInject + helperScript + "</body>");
    res.type("html").send(out);
  });
});

/* ------------------------------------------------------------------ */
/*  App routes                                                         */
/* ------------------------------------------------------------------ */
app.get("/protected-route", authenticateJWT, (_req, res) =>
  res.json({ message: "Access granted!" })
);
// silence favicon 404s
app.get("/favicon.ico", (_req, res) => res.status(204).end());
app.get("/check", (req, res) => {
  res.json({ isAuthenticated: req.isAuthenticated(), user: req.user });
});
app.get("/api/current_user", authenticateJWT, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "displayName email role"
    );
    res.json(user);
  } catch (err) {
    console.error("Error fetching current user:", err);
    res.status(500).json({ message: err.message });
  }
});

/* Users (admin) */
app.get("/users", authenticateJWT, checkRole("admin"), async (_req, res) => {
  try {
    const users = await User.find({}, "displayName email role");
    res.json(users);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ message: err.message });
  }
});
app.patch(
  "/users/:id/role",
  authenticateJWT,
  checkRole("admin"),
  async (req, res) => {
    try {
      const { role } = req.body;
      if (!["user", "admin"].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      const updatedUser = await User.findByIdAndUpdate(
        req.params.id,
        { role },
        { new: true }
      );
      if (!updatedUser)
        return res.status(404).json({ message: "User not found" });
      res.json({ message: `User role updated to ${role}`, updatedUser });
    } catch (err) {
      console.error("Error updating user role:", err);
      res.status(500).json({ message: err.message });
    }
  }
);
app.delete(
  "/users/:id",
  authenticateJWT,
  checkRole("admin"),
  async (req, res) => {
    try {
      // Find the user document first
      const userToDelete = await User.findById(req.params.id);
      if (!userToDelete) {
        return res.status(404).json({ message: "User not found" });
      }

      // Calling .deleteOne() on the document instance triggers the middleware
      await userToDelete.deleteOne();

      res.json({
        message: "User and all associated tasks deleted successfully",
      });
    } catch (err) {
      console.error("Error deleting user:", err);
      res.status(500).json({ message: err.message });
    }
  }
);

/* New dedicated route for exporting tasks with rate limiting */
app.get(
  "/api/export/tasks",
  authenticateJWT,
  exportLimiter,
  async (req, res) => {
    try {
      const tasks = await Task.find({ userId: req.user.id });
      res.json(tasks);
    } catch (err) {
      console.error("Error fetching tasks for export:", err);
      res.status(500).json({ message: err.message });
    }
  }
);

/* Tasks */
app.get("/tasks", authenticateJWT, async (req, res) => {
  try {
    const tasks = await Task.find({ userId: req.user.id });
    res.json(tasks);
  } catch (err) {
    console.error("Error fetching tasks:", err);
    res.status(500).json({ message: err.message });
  }
});

app.get("/tasks/:id", authenticateJWT, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    if (req.user.role !== "admin" && task.userId.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ message: "Forbidden: You do not have access to this task" });
    }
    res.json(task);
  } catch (err) {
    console.error("Error fetching task:", err);
    res.status(500).json({ message: err.message });
  }
});
app.post("/tasks", authenticateJWT, async (req, res) => {
  try {
    const task = new Task({
      text: req.body.text,
      completed: req.body.completed || false,
      userId: req.user.id,
      lastUpdated: new Date(),
    });
    const newTask = await task.save();
    res.status(201).json(newTask);
  } catch (err) {
    console.error("Error creating task:", err);
    res.status(400).json({ message: err.message });
  }
});
app.patch("/tasks/:id", authenticateJWT, async (req, res) => {
  try {
    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      {
        text: req.body.text,
        completed: req.body.completed,
        lastUpdated: new Date(),
      },
      { new: true }
    );
    if (!updatedTask)
      return res.status(404).json({ message: "Task not found" });
    res.json(updatedTask);
  } catch (err) {
    console.error("Error updating task:", err);
    res.status(400).json({ message: err.message });
  }
});
app.delete("/tasks/:id", authenticateJWT, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    if (req.user.role !== "admin" && task.userId.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ message: "Forbidden: Not allowed to delete this task" });
    }
    await Task.findByIdAndDelete(req.params.id);
    res.json({ message: "Task deleted successfully" });
  } catch (err) {
    console.error("Error deleting task:", err);
    res.status(500).json({ message: err.message });
  }
});
/* Background images (S3) */
app.get("/images", authenticateJWT, async (req, res) => {
  try {
    const base = process.env.S3_BUCKET_NAME
      ? `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com`
      : "";
    const predefinedImages = base
      ? [
          `${base}/bg1.png`,
          `${base}/bg2.png`,
          `${base}/bg3.png`,
          `${base}/bg4.png`,
          `${base}/bg5.png`,
        ]
      : [];
    res.status(200).json(predefinedImages);
  } catch (error) {
    console.error("Error fetching images:", error);
    res.status(500).json({ error: "Error fetching images" });
  }
});
/* ------------------------------------------------------------------ */
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
