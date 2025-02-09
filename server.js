const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5001;

// Middleware
app.use(bodyParser.json());
app.use(cors());

// MongoDB Atlas connection
const uri = 'mongodb+srv://lrrecristobal:lQDnKOvj8nurk0PI@todocluster.inpor.mongodb.net/?retryWrites=true&w=majority&appName=todoCluster';
mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
   .then(() => console.log('MongoDB connected'))
   .catch(err => console.log(err));


// Task schema and model
const taskSchema = new mongoose.Schema({
   text: String,
   completed: Boolean,
   lastUpdated: { type: Date, default: Date.now }
});




const Task = mongoose.model('Task', taskSchema);




// Routes
app.get('/tasks', async (req, res) => {
   try {
       const tasks = await Task.find();
       res.json(tasks);
   } catch (err) {
       console.error('Error fetching tasks:', err);
       res.status(500).json({ message: err.message });
   }
});


app.get('/tasks/:id', async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }
        res.json(task);
    } catch (err) {
        console.error('Error fetching task:', err);
        res.status(500).json({ message: err.message });
    }
});


app.post('/tasks', async (req, res) => {
   const task = new Task({
       text: req.body.text,
       completed: req.body.completed
   });


   try {
       const newTask = await task.save();
       res.status(201).json(newTask);
   } catch (err) {
       console.error('Error creating task:', err);
       res.status(400).json({ message: err.message });
   }
});




app.delete('/tasks/:id', async (req, res) => {
   try {
       const deletedTask = await Task.findByIdAndDelete(req.params.id);
     
       if (!deletedTask) {
           return res.status(404).json({ message: 'Task not found' });
       }
     
       res.json({ message: 'Task deleted successfully' });
   } catch (err) {
       console.error('Error deleting task:', err);
       res.status(500).json({ message: err.message });
   }
});




app.patch('/tasks/:id', async (req, res) => {
   try {
       const updatedTask = await Task.findByIdAndUpdate(
           req.params.id,
           {
               text: req.body.text,
               completed: req.body.completed,
               lastUpdated: new Date()
           },
           { new: true }
       );




       if (!updatedTask) {
           return res.status(404).json({ message: 'Task not found' });
       }




       res.json(updatedTask);
   } catch (err) {
       console.error('Error updating task:', err);
       res.status(400).json({ message: err.message });
   }
});




app.listen(port, () => {
   console.log(`Server running on port ${port}`);
});
