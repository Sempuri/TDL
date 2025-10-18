document.addEventListener("DOMContentLoaded", () => {
  const checkbox = document.getElementById("consent-checkbox");
  const submitBtn = document.getElementById("submit-consent");
  const form = document.getElementById("consent-form");

  checkbox.addEventListener("change", () => {
    submitBtn.disabled = !checkbox.checked;
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!checkbox.checked) {
      alert("You must agree to the terms to continue.");
      return;
    }

    try {
      const response = await fetch("/api/consent", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consentGiven: true,
          policyVersion: "1.0", // You can update this version later
        }),
      });

      if (response.ok) {
        window.location.href = "/"; // Redirect to the main app
      } else {
        const error = await response.json();
        alert(`Error: ${error.message}`);
      }
    } catch (error) {
      console.error("Error submitting consent:", error);
      alert("An unexpected error occurred. Please try again.");
    }
  });
});
