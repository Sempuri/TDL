<h1>📝 My To-Do List</h1>

<p>
A web-based application developed in our previous <strong>Web Technology Application</strong> course. It supports <strong>Google OAuth login</strong>, <strong>random activity suggestions</strong>, <strong>JSON import/export</strong>, and <strong>role-based access</strong>, alongside <strong>core task management features</strong>.
</p>

<hr/>

<h2>🚀 Features</h2>
<ul>
  <li><strong>Task Management</strong>
    <ul>
      <li>Create, edit, delete tasks</li>
      <li>Mark tasks as completed or in progress</li>
      <li>Filter tasks by status</li>
    </ul>
  </li>
  <li><strong>User Authentication</strong>
    <ul>
      <li>Google OAuth login (via Passport.js)</li>
      <li>JWT-based session management</li>
    </ul>
  </li>
  <li><strong>Role-Based Access Control</strong>
    <ul>
      <li>Admins can manage accounts and roles</li>
      <li>Regular users can only manage their own tasks</li>
    </ul>
  </li>
  <li><strong>File Handling</strong>
    <ul>
      <li>Import/export tasks in JSON format</li>
      <li>Background images stored in AWS S3</li>
    </ul>
  </li>
  <li><strong>Error Handling & Security</strong>
    <ul>
      <li>Input validation with <code>express-validator</code></li>
      <li>Secure HTTP headers with <code>helmet</code></li>
      <li>Handles 401, 403, 404, and 500 errors</li>
    </ul>
  </li>
</ul>

<hr/>

<h2>📂 Tech Stack</h2>
<ul>
  <li><strong>Frontend:</strong> HTML, CSS, JavaScript</li>
  <li><strong>Backend:</strong> Node.js, Express.js</li>
  <li><strong>Database:</strong> MongoDB Atlas</li>
  <li><strong>Authentication:</strong> Google OAuth + JWT</li>
  <li><strong>File Storage:</strong> AWS S3</li>
</ul>

<hr/>

<h2>⚙️ Installation & Setup</h2>

<ol>
  <li><strong>Clone the repo</strong>
    <pre><code>git clone https://github.com/Sempuri/TDL.git
cd TDL</code></pre>
  </li>

  <li><strong>Install dependencies</strong>
    <pre><code>npm install</code></pre>
  </li>

  <li><strong>Environment variables</strong>
    <p>Copy the example file and configure credentials:</p>
    <pre><code>cp .env.example .env</code></pre>
  </li>

  <li><strong>Run the app</strong>
    <pre><code>npm start</code></pre>
    <p>The app will be available at <a href="http://localhost:3000">http://localhost:3000</a></p>
  </li>
</ol>

<hr/>

<h2>📡 API Endpoints</h2>

<table>
  <tr>
    <th>Feature</th>
    <th>Endpoint</th>
    <th>Method</th>
    <th>Params/Body</th>
    <th>Response</th>
  </tr>
  <tr>
    <td>Fetch all tasks</td>
    <td><code>/tasks</code></td>
    <td>GET</td>
    <td>None</td>
    <td>List of tasks</td>
  </tr>
  <tr>
    <td>Fetch single task</td>
    <td><code>/tasks/:id</code></td>
    <td>GET</td>
    <td>id</td>
    <td>Task object</td>
  </tr>
  <tr>
    <td>Create new task</td>
    <td><code>/tasks</code></td>
    <td>POST</td>
    <td>text, completed</td>
    <td>Task object</td>
  </tr>
  <tr>
    <td>Update task</td>
    <td><code>/tasks/:id</code></td>
    <td>PATCH</td>
    <td>id, text, completed</td>
    <td>Updated task</td>
  </tr>
  <tr>
    <td>Delete task</td>
    <td><code>/tasks/:id</code></td>
    <td>DELETE</td>
    <td>id</td>
    <td>Success message</td>
  </tr>
  <tr>
    <td>Random activity</td>
    <td><code>/activity</code></td>
    <td>GET</td>
    <td>None</td>
    <td>Activity suggestion</td>
  </tr>
</table>
