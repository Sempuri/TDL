// Defensive: some browser extensions (e.g. Ghostery) inject scripts that
// can cause syntax errors such as "string literal contains an unescaped line break".
// Those errors originate from chrome-extension:// URLs and are outside our control.
// We add a targeted global error handler to suppress the noisy extension-origin
// SyntaxError while letting real app errors surface.
window.addEventListener(
  "error",
  (e) => {
    try {
      const msg = e && (e.message || "");
      const src = e && (e.filename || (e.error && e.error.fileName) || "");
      if (
        typeof msg === "string" &&
        msg.includes("string literal contains an unescaped line break") &&
        typeof src === "string" &&
        src.startsWith("chrome-extension://")
      ) {
        // Suppress default logging for this known extension-induced SyntaxError
        if (e.preventDefault) e.preventDefault();
        // Optionally log a compact message so developers know it was suppressed
        console.debug("Suppressed extension SyntaxError from", src);
        return true;
      }
    } catch {
      // swallow
    }
    // allow other errors to proceed
  },
  true
);

document.addEventListener("DOMContentLoaded", async () => {
  const loginButton = document.querySelector("#login-button");
  const loginForm = document.querySelector("#login-form"); // Select the login form

  // Handle Google login button click
  if (loginButton) {
    loginButton.addEventListener("click", () => {
      console.log("Login button clicked");
      window.location.href = "/auth/google"; // Redirect to Google authentication
    });
  }

  // Handle traditional login form submission
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault(); // Prevent the default form submission

      const email = document.getElementById("email").value; // Get email input value
      const password = document.getElementById("password").value; // Get password input value

      try {
        const response = await fetch("/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }), // Send email and password as JSON
        });

        if (response.ok) {
          // Redirect to the main page or dashboard
          window.location.href = "/";
        } else {
          const errorData = await response.json();
          alert(errorData.message || "Login failed. Please try again."); // Show error message
        }
      } catch (error) {
        console.error("Error logging in:", error);
        alert("An error occurred. Please try again later."); // Show generic error message
      }
    });
  }

  // Fetch current user data (defensive: handle non-JSON responses)
  try {
    const userResponse = await fetch("/api/current_user", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });

    if (!userResponse.ok) {
      // 401 on the login page is expected when no user is logged in; keep this silent.
      if (userResponse.status !== 401) {
        console.warn(
          "User not authenticated or response not OK",
          userResponse.status
        );
      }
    } else {
      const contentType = userResponse.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const user = await userResponse.json();
        if (user && user.user !== null) {
          if (loginButton) loginButton.classList.add("hidden");
          if (loginForm) loginForm.classList.add("hidden");
        }
      } else {
        // Not JSON (likely redirected to HTML), treat as not logged in
        console.warn(
          "/api/current_user did not return JSON; skipping user hide logic."
        );
      }
    }
  } catch (error) {
    console.error("Error fetching user data:", error);
  }
});
