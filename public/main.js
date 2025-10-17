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

  // Check if user is logged in
  const response = await fetch("/api/current_user", { credentials: "include" });
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

  // import functionality
  document.querySelector("#import-button").addEventListener("click", () => {
    document.querySelector("#file-input").click(); // Trigger file input click
  });

  document
    .querySelector("#file-input")
    .addEventListener("change", async (event) => {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            // Get current user first
            const userResponse = await fetch("/api/current_user", {
              credentials: "include",
            });
            const user = await userResponse.json();

            if (!user) {
              alert("Please log in to import tasks.");
              return;
            }

            let tasks;
            try {
              tasks = JSON.parse(e.target.result);
              if (!Array.isArray(tasks)) {
                throw new Error("Imported data is not an array of tasks");
              }
            } catch (parseError) {
              alert("Invalid JSON format. Please check your file.");
              console.error("JSON parse error:", parseError);
              return;
            }

            let successCount = 0;
            let errorCount = 0;

            // Process each task with proper validation
            for (const task of tasks) {
              // Validate the task has the required text field
              let taskText = null;

              // Check various possible field names in the imported JSON
              if (task.text) taskText = task.text;
              else if (task.task) taskText = task.task;
              else if (task.content) taskText = task.content;
              else if (task.description) taskText = task.description;

              // Skip tasks without text
              if (
                !taskText ||
                typeof taskText !== "string" ||
                taskText.trim() === ""
              ) {
                console.error(
                  "Skipping task with missing or invalid text:",
                  task
                );
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
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(newTask),
                });

                if (!response.ok) {
                  const errorData = await response.json();
                  throw new Error(
                    `Server error: ${errorData.message || response.statusText}`
                  );
                }

                successCount++;
              } catch (taskError) {
                console.error("Error creating task:", taskError);
                errorCount++;
              }
            }

            // Refresh the task list
            await fetchTasks();

            // Show result to user
            if (successCount > 0 && errorCount === 0) {
              alert(`Successfully imported ${successCount} tasks.`);
            } else if (successCount > 0 && errorCount > 0) {
              alert(
                `Imported ${successCount} tasks successfully, but ${errorCount} tasks could not be imported due to errors. Check console for details.`
              );
            } else {
              alert(
                `Failed to import any tasks. Please check if the file format is correct.`
              );
            }

            // Reset the file input
            document.querySelector("#file-input").value = "";
          } catch (error) {
            console.error("Error during import process:", error);
            alert("An error occurred during import. Please try again.");
            document.querySelector("#file-input").value = "";
          }
        };
        reader.readAsText(file);
      }
    });

  // export functionality
  document
    .querySelector("#export-button")
    .addEventListener("click", async () => {
      const response = await fetch("/tasks", { credentials: "include" });
      const tasks = await response.json();

      // Check if there are any tasks
      if (tasks.length === 0) {
        alert("Cannot export: your task list is empty!");
        return; // Stop execution if there are no tasks
      }

      // Convert tasks to JSON format
      const jsonTasks = JSON.stringify(tasks, null, 2); // Pretty print with 2 spaces

      // Create a blob from the JSON string
      const blob = new Blob([jsonTasks], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      // Create a temporary link element to trigger the download
      const a = document.createElement("a");
      a.href = url;
      a.download = `tasks_${new Date().toISOString().split("T")[0]}.json`; // Filename with today's date
      document.body.appendChild(a);
      a.click(); // Trigger the download
      document.body.removeChild(a); // Clean up
      URL.revokeObjectURL(url); // Release the blob URL
    });

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
      const response = await fetch("/api/current_user");
      const user = await response.json();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const userId = user._id; // Assuming the API returns the user's ID
      const responseTasks = await fetch(`/tasks?userId=${userId}`);

      if (responseTasks.status === 401) {
        window.location.href = "/login";
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
      const userResponse = await fetch("/api/current_user", {
        credentials: "include",
      });
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
    try {
      const res = await fetch("/api/current_user", { credentials: "include" });
      if (res.ok) {
        const user = await res.json();
        // On first check, store the current role
        if (!currentUserRole) {
          currentUserRole = user.role;
        } else if (currentUserRole !== user.role) {
          alert(
            `Your role has been updated to ${user.role}. You will now be logged out.`
          );
          await fetch("/auth/logout", {
            method: "POST",
            credentials: "include",
          });
          window.location.href = "/login";
        }
      }
    } catch (error) {
      console.error("Error checking user role:", error);
    }
  }

  // Check for role changes every 3 seconds
  setInterval(checkRoleChange, 3000);
});
