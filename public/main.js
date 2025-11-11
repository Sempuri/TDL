window.addEventListener("load", async () => {
  const form = document.querySelector("#to-do-form");
  const input = document.querySelector("#new-task-input");
  const list_el = document.querySelector("#tasks");
  const filter = document.querySelector("#filter-tasks");
  const cycleImagesButton = document.querySelector("#cycle-images-button");

  let currentlyEditingTask = null; // Track the currently editing task
  let originalTaskText = ""; // Store original text before editing
  let images = []; // Array to hold image URLs
  let currentIndex = 0; // Index for cycling through images

  let AUTH_BLOCKED = false;      // stop all further auth calls once 401/403 happens
  let ROLE_CHECK_TIMER = null;   // store the setInterval id

  function handleUnauthorized() {
    if (AUTH_BLOCKED) return;
    AUTH_BLOCKED = true;
    if (ROLE_CHECK_TIMER) clearInterval(ROLE_CHECK_TIMER);
    try { localStorage.clear(); } catch {}
    window.location.replace('/login');   // hard redirect: stops JS + polls
  }

  // Check if user is logged in
  const response = await fetch("/api/current_user", { credentials: "include" });
  if (response.status === 401 || response.status === 403) {
    handleUnauthorized();
    return;
  }
  const user = await response.json();

  const logoutButton = document.querySelector("#logout-button");
  if (logoutButton) {
    if (user) {
      logoutButton.classList.remove("hidden"); // Show logout button if user is logged in
    } else {
      logoutButton.classList.add("hidden"); // Hide logout button if user is not logged in
    }

    logoutButton.addEventListener("click", async () => {
      await fetch("/auth/logout", { method: "POST", credentials: "include" });
      alert("Logged out successfully");
      window.location.href = "/login";
    });
  }

  // Add this block to handle the dashboard button visibility
  const manageBtn = document.getElementById("manage-dashboard-button");
  if (manageBtn) {
    if (user && user.role === "admin") {
      manageBtn.classList.remove("hidden");
    } else {
      manageBtn.classList.add("hidden");
    }
  }

  // import functionality
  document.querySelector("#import-button").addEventListener("click", () => {
    document.querySelector("#file-input").click(); // Trigger file input click
  });

  document
    .querySelector("#file-input")
    .addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      if (file.name.endsWith(".bin")) {
        // Handle encrypted file
        const password = prompt(
          "This file is encrypted. Please enter the password to decrypt it:"
        );
        if (!password) {
          alert("Import cancelled. Password is required.");
          document.querySelector("#file-input").value = ""; // Reset input
          return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const decryptedJson = await decryptData(e.target.result, password);
            await processImportedTasks(JSON.parse(decryptedJson));
          } catch (error) {
            console.error("Decryption failed:", error);
            alert(
              "Decryption failed. The password may be incorrect or the file may be corrupted."
            );
          } finally {
            document.querySelector("#file-input").value = ""; // Reset input
          }
        };
        reader.readAsArrayBuffer(file);
      } else if (file.name.endsWith(".json")) {
        // Handle unencrypted JSON file (for backward compatibility)
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const tasks = JSON.parse(e.target.result);
            await processImportedTasks(tasks);
          } catch (error) {
            alert("Invalid JSON format. Please check your file.");
            console.error("JSON parse error:", error);
          } finally {
            document.querySelector("#file-input").value = ""; // Reset input
          }
        };
        reader.readAsText(file);
      } else {
        alert("Unsupported file type. Please select a .json or .bin file.");
        document.querySelector("#file-input").value = ""; // Reset input
      }
    });

  // This is a new helper function to avoid duplicating the task processing logic.
  // You can move the logic from your old file-input listener into here.
  async function processImportedTasks(tasks) {
    if (!Array.isArray(tasks)) {
      alert("Imported data is not in the correct format.");
      return;
    }

    const userResponse = await fetch("/api/current_user", {
      credentials: "include",
    });
    const user = await userResponse.json();
    if (!user) {
      alert("Please log in to import tasks.");
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const task of tasks) {
      let taskText = task.text || task.task || task.content || task.description;
      if (!taskText || typeof taskText !== "string" || taskText.trim() === "") {
        errorCount++;
        continue;
      }

      const newTask = {
        text: taskText.trim(),
        completed: Boolean(
          task.completed || task.status === "completed" || task.done
        ),
        userId: user._id,
        lastUpdated: new Date().toISOString(),
      };

      try {
        const response = await fetch("/tasks", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newTask),
        });
        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch {
        errorCount++;
      }
    }

    await fetchTasks();

    if (successCount > 0) {
      alert(`Successfully imported ${successCount} tasks.`);
    } else {
      alert(
        "Failed to import tasks. Please check the file and console for errors."
      );
    }
  }

  // export functionality
  document
    .querySelector("#export-button")
    .addEventListener("click", async () => {
      const password = prompt(
        "Please enter a password to encrypt this file.\n\nWARNING: This password cannot be recovered. If you forget it, this file cannot be opened."
      );

      if (!password) {
        alert("Export cancelled.");
        return;
      }

      const confirmPassword = prompt("Please confirm your password:");

      if (password !== confirmPassword) {
        alert("Passwords do not match. Export cancelled.");
        return;
      }

      try {
        // Point the export fetch to the new rate-limited endpoint
        const response = await fetch("/api/export/tasks", {
          credentials: "include",
        });

        if (response.status === 401 || response.status === 403) {
          handleUnauthorized();
          return;
        }

        //check to handle rate limiting and other errors
        if (!response.ok) {
          if (response.status === 429) {
            const errorData = await response.json();
            alert(
              errorData.message || "Too many requests. Please try again later."
            );
          } else {
            alert(`Error fetching tasks: ${response.statusText}`);
          }
          return; // Stop the export process
        }

        const tasks = await response.json();

        if (tasks.length === 0) {
          alert("Cannot export: your task list is empty!");
          return;
        }

        const jsonTasks = JSON.stringify(tasks, null, 2);
        const encryptedData = await encryptData(jsonTasks, password);

        const blob = new Blob([encryptedData], {
          type: "application/octet-stream",
        });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = `tasks_encrypted_${
          new Date().toISOString().split("T")[0]
        }.bin`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        alert(
          "Export successful! The encrypted file has been saved.\n\nIMPORTANT: Remember the password you just used. It is required to open this file."
        );
      } catch (error) {
        console.error("Error during encrypted export:", error);
        alert("An error occurred during the export process.");
      }
    });

  /**
   * Encrypts data using AES-256-GCM with a password-derived key.
   * @param {string} plaintext - The data to encrypt.
   * @param {string} password - The user's password.
   * @returns {Promise<ArrayBuffer>} - The encrypted data (salt + IV + ciphertext).
   */
  async function encryptData(plaintext, password) {
    const textEncoder = new TextEncoder();
    const data = textEncoder.encode(plaintext);

    // Generate a random salt for key derivation
    const salt = window.crypto.getRandomValues(new Uint8Array(16));

    // Derive a key from the password and salt using PBKDF2
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      textEncoder.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    const key = await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );

    // Generate a random Initialization Vector (IV)
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    // Encrypt the data
    const encryptedContent = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      key,
      data
    );

    // Combine salt, IV, and ciphertext into a single buffer for storage
    const result = new Uint8Array(
      salt.length + iv.length + encryptedContent.byteLength
    );
    result.set(salt, 0);
    result.set(iv, salt.length);
    result.set(new Uint8Array(encryptedContent), salt.length + iv.length);

    return result.buffer;
  }

  /**
   * Decrypts data using AES-256-GCM with a password-derived key.
   * @param {ArrayBuffer} encryptedData - The data to decrypt (salt + IV + ciphertext).
   * @param {string} password - The user's password.
   * @returns {Promise<string>} - The decrypted plaintext.
   */
  async function decryptData(encryptedData, password) {
    const textEncoder = new TextEncoder();
    const textDecoder = new TextDecoder();
    const data = new Uint8Array(encryptedData);

    // Extract salt and IV from the beginning of the data
    const salt = data.slice(0, 16);
    const iv = data.slice(16, 28);
    const ciphertext = data.slice(28);

    // Derive the key from the password and salt
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      textEncoder.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    const key = await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );

    // Decrypt the data
    const decryptedContent = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      key,
      ciphertext
    );

    return textDecoder.decode(decryptedContent);
  }

  // Add "Random Activity" Button
  const randomActivityBtn = document.createElement("button");
  randomActivityBtn.id = "random-activity-btn";
  randomActivityBtn.textContent = "🎲";
  randomActivityBtn.type = "button"; // Prevent form submission
  form.appendChild(randomActivityBtn);

  // Insert the button before the input field
  form.insertBefore(randomActivityBtn, input);

  // Event Listener for Button Click
  randomActivityBtn.addEventListener("click", (e) => {
    e.preventDefault(); // Prevent any form submission
    getRandomActivity();
  });

  // Fetch and Display Random Activity
  async function getRandomActivity() {
    try {
      const originalPlaceholder = "What do you need to do today?";
      input.placeholder = "Generating a random activity..."; // Set temporary placeholder
      input.value = ""; // Clear input field

      let activity = "";
      do {
        const response = await fetch(
          "https://apis.scrimba.com/bored/api/activity"
        );
        const data = await response.json();
        activity = data.activity
          .replace(/\byour\b/gi, "my")
          .replace(/\byou're\b/gi, "I'm")
          .replace(/\byou've\b/gi, "I've")
          .replace(/\byou are\b/gi, "I am")
          .replace(/\bfor you and\b/gi, "for me and")
          .replace(/\bto you and\b/gi, "to me and")
          .replace(/\byou\b/gi, "I");
      } while (activity.length > 30); // Keep fetching until activity is 30 characters or less

      input.value = activity; // Autofill the input field
      input.placeholder = originalPlaceholder;
      input.focus(); // Put the cursor in the input field so the user can edit it
    } catch (error) {
      console.error("Error fetching random activity:", error);
      input.placeholder = "Error fetching activity. Try again!";
    }
  }

  const formatDateTime = (dateTimeString) => {
    const date = new Date(dateTimeString);
    const options = {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    };
    return date.toLocaleString("en-US", options);
  };

  const fetchTasks = async () => {
    try {
      const response = await fetch("/api/current_user", { credentials: "include" });
      if (response.status === 401 || response.status === 403) {
        handleUnauthorized();
        return;
      }
      const user = await response.json();
      if (!user) {
        handleUnauthorized();
        return;
      }
      const userId = user._id; // Assuming the API returns the user's ID
      const responseTasks = await fetch(`/tasks?userId=${userId}`, { credentials: "include" });
      if (responseTasks.status === 401 || responseTasks.status === 403) {
        handleUnauthorized();
        return;
      }

      let tasks = await responseTasks.json();
      list_el.innerHTML = "";

      tasks.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));

      for (const task of tasks) {
        await createTaskElement(task);
      }
    } catch (error) {
      console.error("Error fetching tasks:", error);
      list_el.innerHTML = "";
    }
  };

  const createTaskElement = async (task) => {
    let existingTask = document.querySelector(`.task[data-id='${task._id}']`);

    if (existingTask) {
      // Remove the existing task element before re-adding it at the top
      existingTask.remove();
    }

    const task_el = document.createElement("div");
    task_el.classList.add("task");
    task_el.dataset.id = task._id;
    task_el.classList.add("move-to-top");

    // Add animation class
    task_el.classList.add("move-to-top");

    const task_content_el = document.createElement("div");
    task_content_el.classList.add("content");
    task_el.appendChild(task_content_el);

    const task_checkbox_container = document.createElement("label");
    task_checkbox_container.classList.add("container");

    const task_checkbox_el = document.createElement("input");
    task_checkbox_el.type = "checkbox";
    task_checkbox_el.classList.add("checkbox");
    task_checkbox_el.checked = task.completed;

    const task_checkmark_el = document.createElement("div");
    task_checkmark_el.classList.add("checkmark");

    task_checkbox_container.appendChild(task_checkbox_el);
    task_checkbox_container.appendChild(task_checkmark_el);

    const task_input_el = document.createElement("input");
    task_input_el.classList.add("text");
    task_input_el.type = "text";
    task_input_el.value = task.text;
    task_input_el.setAttribute("readonly", "readonly");

    // Apply styles based on the completed status
    if (task.completed) {
      task_input_el.classList.add("completed");
      task_input_el.style.color = "#6b7e8f"; // Gray color
    }

    task_content_el.appendChild(task_checkbox_container);
    task_content_el.appendChild(task_input_el);

    const lastUpdatedEl = document.createElement("span");
    lastUpdatedEl.classList.add("last-updated");

    const updateLastUpdatedTime = async () => {
      try {
        lastUpdatedEl.textContent = `Last Updated: ${formatDateTime(
          new Date().toISOString()
        )}`;
      } catch (error) {
        console.error("Error updating time:", error);
      }
    };

    if (task.lastUpdated) {
      lastUpdatedEl.textContent = `Last Updated: ${formatDateTime(
        task.lastUpdated
      )}`;
    } else {
      await updateLastUpdatedTime();
    }

    task_content_el.appendChild(lastUpdatedEl);

    const task_actions_el = document.createElement("div");
    task_actions_el.classList.add("actions");

    const task_edit_el = document.createElement("button");
    task_edit_el.classList.add("edit");
    task_edit_el.innerHTML = "Edit";

    const task_delete_el = document.createElement("button");
    task_delete_el.classList.add("delete");
    task_delete_el.innerHTML = "Delete";

    task_actions_el.appendChild(task_edit_el);
    task_actions_el.appendChild(task_delete_el);

    task_el.appendChild(task_actions_el);

    const insertTask = (task_el, lastUpdated) => {
      const taskDate = new Date(lastUpdated || 0);
      let inserted = false;

      // Loop through existing tasks to find the correct position
      for (let i = 0; i < list_el.children.length; i++) {
        const currentTask = list_el.children[i];
        const currentDateText = currentTask
          .querySelector(".last-updated")
          .textContent.split(": ")[1];
        const currentDate = new Date(currentDateText);

        // Insert before the first task that is older
        if (taskDate > currentDate) {
          list_el.insertBefore(task_el, currentTask);
          inserted = true;
          break;
        }
      }

      // If this is the oldest task or the list is empty, append it
      if (!inserted) {
        list_el.appendChild(task_el);
      }
    };

    // Then use it in createTaskElement
    insertTask(task_el, task.lastUpdated);

    // Apply animation effect
    setTimeout(() => {
      task_el.classList.remove("move-to-top");
    }, 500);

    task_actions_el.classList.add("actions");

    // Hide edit button if the task is completed
    if (task.completed) {
      task_edit_el.style.display = "none";
    }

    task_edit_el.addEventListener("click", async () => {
      if (task_edit_el.innerText.toLowerCase() === "edit") {
        if (currentlyEditingTask) {
          alert(
            "Please save or cancel the current edit before editing another task."
          );
          return;
        }
        currentlyEditingTask = task_el; // Set the currently editing task
        originalTaskText = task_input_el.value; // Save the original text before editing
        task_input_el.removeAttribute("readonly");
        task_input_el.style.fontStyle = "italic";
        task_input_el.focus();
        task_edit_el.innerText = "Save";
        task_delete_el.innerText = "Cancel";
        task_checkbox_container.style.display = "none";

        task_input_el.style.color = "#df85ff";
      } else {
        if (task_input_el.value.trim() === "") {
          task_input_el.value = originalTaskText; // Revert if empty
        } else if (task_input_el.value === originalTaskText) {
          alert("No changes made."); // Notify user

          task_input_el.style.fontStyle = "normal";
          task_input_el.setAttribute("readonly", "readonly");
          task_edit_el.innerText = "Edit";
          task_delete_el.innerText = "Delete";
          task_checkbox_container.style.display = "flex"; // Show checkbox again

          task_input_el.style.color = "#fff";

          currentlyEditingTask = null; // Reset the currently editing task

          return;
        } else {
          task_input_el.style.fontStyle = "normal";
          task_input_el.setAttribute("readonly", "readonly");
          task_edit_el.innerText = "Edit";
          task_delete_el.innerText = "Delete";
          task_checkbox_container.style.display = "flex";

          task_input_el.style.color = "#fff";

          const updatedTask = {
            text: task_input_el.value,
            completed: task_checkbox_el.checked,
          };

          await fetch(`/tasks/${task_el.dataset.id}`, {
            credentials: "include",
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(updatedTask),
          });

          lastUpdatedEl.textContent = `Last Updated: ${formatDateTime(
            new Date().toISOString()
          )}`;

          list_el.insertBefore(task_el, list_el.firstChild);
          currentlyEditingTask = null; // Reset the currently editing task
        }
      }
    });

    task_delete_el.addEventListener("click", async () => {
      if (task_delete_el.innerText.toLowerCase() === "cancel") {
        // Revert back to original value instead of deleting
        task_input_el.value = originalTaskText;
        task_input_el.style.fontStyle = "normal";
        task_input_el.setAttribute("readonly", "readonly");
        task_edit_el.innerText = "Edit";
        task_delete_el.innerText = "Delete";
        task_checkbox_container.style.display = "flex";

        task_input_el.style.color = "#fff";
        currentlyEditingTask = null; // Reset the currently editing task
      } else {
        // Show confirmation dialog
        const confirmDelete = confirm(
          "Are you sure you want to delete this task?"
        );

        if (confirmDelete) {
          await fetch(`/tasks/${task_el.dataset.id}`, {
            credentials: "include",
            method: "DELETE",
          });
          list_el.removeChild(task_el);
        }
      }
    });

    task_checkbox_el.addEventListener("change", async () => {
      const updatedTask = {
        text: task_input_el.value,
        completed: task_checkbox_el.checked,
      };

      await fetch(`/tasks/${task_el.dataset.id}`, {
        credentials: "include",
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updatedTask),
      });

      if (task_checkbox_el.checked) {
        task_input_el.classList.add("completed");
        task_input_el.style.color = "#6b7e8f";
        task_edit_el.style.display = "none";
      } else {
        task_input_el.classList.remove("completed");
        task_input_el.style.color = "#fff";
        task_edit_el.style.display = "inline-block";
      }
      filter.dispatchEvent(new Event("change"));
    });
  };

  // Task creation logic
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const taskText = input.value.trim();

    if (!taskText) {
      alert("Please enter a task to add."); // Alert if the input is empty
      return; // Exit the function early
    }

    if (taskText) {
      const userResponse = await fetch("/api/current_user", {
        credentials: "include",
      });
      const user = await userResponse.json();

      if (!user) {
        alert("Please log in to add tasks.");
        return;
      }

      const task = {
        text: taskText,
        completed: false,
        userId: user._id, // Attach the user ID
        lastUpdated: new Date().toISOString(),
      };

      try {
        const response = await fetch("/tasks", {
          credentials: "include",
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(task),
        });

        if (!response.ok)
          throw new Error(`HTTP error! status: ${response.status}`);
        await fetchTasks();
        input.value = "";
      } catch (error) {
        console.error("Error adding task:", error);
        alert("Failed to add task. Please check if the server is running.");
      }
    }
  });

  filter.addEventListener("change", () => {
    const filterValue = filter.value;
    const tasks = document.querySelectorAll(".task");

    tasks.forEach((task) => {
      const checkbox = task.querySelector(".checkbox");
      if (filterValue === "all") {
        task.style.display = "flex";
      } else if (filterValue === "completed") {
        if (checkbox.checked) {
          task.style.display = "flex";
        } else {
          task.style.display = "none";
        }
      } else if (filterValue === "in-progress") {
        if (!checkbox.checked) {
          task.style.display = "flex";
        } else {
          task.style.display = "none";
        }
      }
    });
  });

  // Function to cycle images from S3 storage
  const cycleImages = async () => {
    try {
      const userResponse = await fetch("/api/current_user", { credentials: "include" });
      if (userResponse.status === 401 || userResponse.status === 403) {
        handleUnauthorized();
        return;
      }
      const user = await userResponse.json();
      if (!user) return;

      const userId = user._id; // Get user ID from API
      const response = await fetch(`/images?userId=${userId}`, {
        credentials: "include",
      });
      images = await response.json();

      if (images.length > 0) {
        const overlay = document.querySelector(".background-overlay");

        // Retrieve the last saved index from localStorage specific to the user
        currentIndex = localStorage.getItem(`currentImageIndex_${userId}`);
        currentIndex = currentIndex ? parseInt(currentIndex) : 0;

        overlay.style.backgroundImage = `url(${images[currentIndex]})`;

        cycleImagesButton.addEventListener("click", () => {
          overlay.style.opacity = 0;

          currentIndex = (currentIndex + 1) % images.length;

          const newImage = new Image();
          newImage.src = images[currentIndex];

          newImage.onload = () => {
            overlay.style.backgroundImage = `url(${newImage.src})`;
            overlay.style.opacity = 0.5;
          };

          // Save the new index in localStorage for the user
          localStorage.setItem(`currentImageIndex_${userId}`, currentIndex);
        });
      } else {
        console.warn("No images found.");
      }
    } catch (error) {
      console.error("Error fetching images:", error);
      alert("Failed to load images. Please try again later.");
    }
  };

  filter.value = "all";
  await fetchTasks();
  await cycleImages();

  let currentUserRole = null;

  async function checkRoleChange() {
    if (AUTH_BLOCKED) return; // stop if we already saw 401
  
    try {
      const res = await fetch("/api/current_user", { credentials: "include" });
  
      if (res.status === 401 || res.status === 403) {
        handleUnauthorized();
        return;
      }
  
      const user = await res.json();
      if (!user || !user.role) return;   // null-guard fixes the console error
  
      if (!currentUserRole) {
        currentUserRole = user.role;
      } else if (currentUserRole !== user.role) {
        alert(`Your role has been updated to ${user.role}. You will now be logged out.`);
        await fetch("/auth/logout", { method: "POST", credentials: "include" });
        window.location.href = "/login";
      }
    } catch (error) {
      // optional: silent; any 401 is handled above
    }
  }

  // Check for role changes every 3 seconds
  ROLE_CHECK_TIMER = setInterval(checkRoleChange, 3000);
});
