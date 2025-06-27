import express from 'express';
import mongoose from 'mongoose';
import bodyParser from 'body-parser';
import ejs from 'ejs';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();



const saltRounds = 10;
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.static("public"));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));

mongoose.connect(process.env.MONGO_URI);

const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
});

app.use(session({
  secret: 'yourSecretKey',
  resave: false,
  saveUninitialized: false
}));

const noteSchema = new mongoose.Schema({
  content: String,
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Note = mongoose.model("Note", noteSchema);
const User = mongoose.model("User", userSchema);

app.get('/', (req, res) => {
  if (req.session.userId) {
    res.redirect('/home');
  } else {
    res.render('register', { alertMessage: null });
  }
});

app.post('/register', async (req, res) => {
  try {
    const username = req.body.username.trim();
    const email = req.body.email.trim();
    const password = req.body.password.trim();
    const confirmPassword = req.body.confirmPassword.trim();

    const existingUser = await User.findOne({ email: email });
    if (existingUser) {
      return res.render('register', { alertMessage: "Email already registered. Please log in." });
    }
    if (password !== confirmPassword) {
      return res.render('register', { alertMessage: "Passwords do not match" });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = new User({
      username: username,
      email: email,
      password: hashedPassword
    });

    await newUser.save();
    res.render('login', { alertMessage: "Registration successful! Please log in." });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).send("Server error");
  }
});

app.get('/login', (req, res) => {
  res.render('login', { alertMessage: null });
});

app.post('/login', async (req, res) => {
  try {
    const email = req.body.email.trim();
    const password = req.body.password.trim();

    const user = await User.findOne({ email: email });
    if (!user) {
      return res.render('login', { alertMessage: "User not found." });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (isMatch) {
      req.session.userId = user._id;
      req.session.username = user.username;
      res.redirect('/home');
    } else {
      res.render('login', { alertMessage: "Incorrect password" });
    }
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).send("Server error");
  }
});

const isAuthenticated = (req, res, next) => {
  if (req.session.userId) {
    return next();
  }
  res.redirect('/login');
};

app.get('/home', isAuthenticated, (req, res) => {
  res.render('home', { username: req.session.username });
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    res.redirect('/login');
  });
});

app.post('/note', isAuthenticated, async (req, res) => {
  try {
    const note = req.body.note;
    const userId = req.session.userId;

    const newNote = new Note({
      content: note,
      userId: userId
    });
    await newNote.save(); 
    res.redirect('/home');
  } catch (err) {
    console.error("Note creation error:", err);
    res.status(500).send("Server error");
  }
});

  app.get('/notes', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    const notes = await Note.find({ userId: userId }).sort({ createdAt: -1 });
    res.render('notes', { notes });
  }catch(err){
    console.error("Note retrieval error:", err);
    res.status(500).send("Server error");
  }
});

app.post('/notes/update/:id', isAuthenticated, async (req, res) => {
  try {
    const noteId = req.params.id;
    const updatedContent = req.body.updatedContent;
    const userId = req.session.userId;

    const result = await Note.updateOne(
      { _id: noteId, userId: userId },
      { $set: { content: updatedContent } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send("Note not found or you do not have permission to edit it.");
    }
    res.redirect('/notes');
  } catch (err) {
    console.error("Note update error:", err);
    res.status(500).send("Server error");
  }
});

app.post('/notes/delete/:id', isAuthenticated, async (req, res) => {
  const noteId = req.params.id;
  const userId = req.session.userId;
  try {
    const result = await Note.findOneAndDelete({ _id: noteId, userId: userId });
    if (!result) {
      return res.status(404).send("Note not found or you do not have permission to delete it.");
    }
    res.redirect('/notes');
  } catch (err) {
    console.error("Note deletion error:", err);
    res.status(500).send("Server error");
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});