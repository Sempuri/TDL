// Moved from inline <script> in index.html
async function checkUserRole() {
  try {
    const response = await fetch("/api/current_user", {
      credentials: "include",
    });
    const user = await response.json();

    const manageBtn = document.getElementById("manage-dashboard-button");
    if (manageBtn) {
      if (user.role === "admin") {
        manageBtn.classList.remove("hidden");
      } else {
        manageBtn.classList.add("hidden");
      }
    }
  } catch (error) {
    console.error("Error fetching user role:", error);
  }
}

document.addEventListener("DOMContentLoaded", checkUserRole);

document.getElementById("manage-dashboard")?.addEventListener("click", () => {
  window.location.href = "/admin/dashboard";
});
