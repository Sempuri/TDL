// Moved from inline <script> in admin-dashboard.html
let currentAdminId = null;
async function fetchCurrentAdmin() {
  try {
    const res = await fetch("/api/current_user", {
      credentials: "include",
    });
    if (res.ok) {
      const admin = await res.json();
      currentAdminId = admin._id;
    }
  } catch (error) {
    console.error("Error fetching current admin:", error);
  }
}
fetchCurrentAdmin();

let isUserListVisible = false; // Track visibility state

document.getElementById("loadUsersBtn").addEventListener("click", async () => {
  const userList = document.getElementById("userList");

  if (isUserListVisible) {
    userList.innerHTML = ""; // Clear user list when hiding
    userList.classList.add("hidden"); // Hide list
    isUserListVisible = false;
    return;
  }

  const res = await fetch("/users", {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (res.ok) {
    const users = await res.json();
    userList.innerHTML = ""; // Clear previous data
    users.forEach((user) => {
      const userElement = document.createElement("div");
      userElement.className = "bg-gray-700 p-4 rounded-md shadow-md";
      userElement.innerHTML = `
              <p class="text-lg font-semibold">${user.displayName} 
                  <span class="text-gray-300">(${user.email})</span>
              </p>
              <p class="text-sm text-gray-400">Role: ${user.role}</p>
              <div class="mt-2 space-x-2" id="controls-${user._id}"></div>
          `;

      const controls = userElement.querySelector(`#controls-${user._id}`);

      // Create dropdown for role selection
      const roleDropdown = document.createElement("select");
      roleDropdown.className =
        "bg-yellow-600 px-3 py-1 rounded-md text-sm hover:opacity-80";
      if (currentAdminId && user._id === currentAdminId) {
        roleDropdown.disabled = true;
        roleDropdown.innerHTML = `<option value="${user.role}" selected>${
          user.role.charAt(0).toUpperCase() + user.role.slice(1)
        }</option>`;
      } else {
        roleDropdown.innerHTML = `
                    <option value="user" ${
                      user.role === "user" ? "selected" : ""
                    }>User</option>
                    <option value="admin" ${
                      user.role === "admin" ? "selected" : ""
                    }>Admin</option>
                `;
        roleDropdown.onchange = () =>
          confirmChangeRole(user._id, roleDropdown.value);
      }
      controls.appendChild(roleDropdown);

      // Create delete button with self-deletion check
      let deleteBtn;
      if (currentAdminId && user._id === currentAdminId) {
        deleteBtn = document.createElement("button");
        deleteBtn.className =
          "bg-red-500 px-3 py-1 rounded-md text-sm opacity-50 cursor-not-allowed";
        deleteBtn.textContent = "Delete";
        deleteBtn.disabled = true;
        deleteBtn.title = "You cannot delete yourself";
      } else {
        deleteBtn = document.createElement("button");
        deleteBtn.className =
          "bg-red-500 px-3 py-1 rounded-md text-sm hover:opacity-80";
        deleteBtn.textContent = "Delete";
        deleteBtn.onclick = () => deleteUser(user._id);
      }
      controls.appendChild(deleteBtn);

      userList.appendChild(userElement);
    });

    userList.classList.remove("hidden"); // Show list
    isUserListVisible = true;
  } else {
    alert("Error fetching users");
  }
});

async function confirmChangeRole(userId, newRole) {
  const confirmed = confirm(
    `Are you sure you want to change this user's role to ${newRole}?`
  );
  if (confirmed) {
    const res = await fetch(`/users/${userId}/role`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) {
      alert("Role updated successfully");
      // Toggle the user list refresh to update the UI
      document.getElementById("loadUsersBtn").click();
      document.getElementById("loadUsersBtn").click();
    } else {
      alert("Error updating role");
      // Optionally, reload the list to revert the selection
      document.getElementById("loadUsersBtn").click();
      document.getElementById("loadUsersBtn").click();
    }
  } else {
    // If cancelled, revert the selection by reloading the user list
    document.getElementById("loadUsersBtn").click();
    document.getElementById("loadUsersBtn").click();
  }
}

async function deleteUser(userId) {
  const confirmDelete = confirm("Are you sure you want to delete this user?");
  if (confirmDelete) {
    const res = await fetch(`/users/${userId}`, {
      method: "DELETE",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (res.ok) {
      alert("User deleted successfully");
      document.getElementById("loadUsersBtn").click(); // Toggle list to refresh
      document.getElementById("loadUsersBtn").click();
    } else {
      alert("Error deleting user");
    }
  }
}

async function checkAdminRole() {
  try {
    const res = await fetch("/api/current_user", {
      credentials: "include",
    });
    if (res.ok) {
      const user = await res.json();
      if (user.role !== "admin") {
        alert(
          "Your admin privileges have been revoked. You will now be logged out."
        );
        // Log out the user and redirect to login.
        await fetch("/auth/logout", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        window.location.href = "/login";
      }
    }
  } catch (error) {
    console.error("Error checking admin role:", error);
  }
}

setInterval(checkAdminRole, 2000);

document.getElementById("logoutBtn").addEventListener("click", async () => {
  const res = await fetch("/auth/logout", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (res.ok) {
    alert("Logged out successfully");
    window.location.href = "/login";
  } else {
    alert("Error logging out");
  }
});

document.getElementById("todoListBtn").addEventListener("click", () => {
  window.location.href = "/";
});
