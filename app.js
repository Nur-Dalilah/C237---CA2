const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const app = express();

// set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images'); // directory to save uploaded files
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); 
    }
});

const upload = multer({ storage: storage });

const connection = mysql.createConnection({
    host: 'switchyard.proxy.rlwy.net',
    port: 42564,
    user: 'root',
    password: 'ejkCTGWYkRbYooUcykISTUVCfyRiPgcy',
    database: 'railway'
});

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL database');
});

// set up view engine
app.set('view engine', 'ejs');
//  enable static files
app.use(express.static('public'));
// enable form processing
app.use(express.urlencoded({
    extended: false
}));

//TO DO: insert code for Session Middleware below 
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    // session expires after 1 week of inactivity
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } 
}));

app.use(flash());

// middleware to check if user is logged in
const checkAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    } else {
        req.flash('error', 'Please log in to view this resource');
        res.redirect('/login');
    }
};

// middleware to check if user is admin
const checkAdmin = (req, res, next) => {
    if (req.session.user.role === 'admin') {
        return next();
    } else {
        req.flash('error', 'Access denied');
        res.redirect('/shopping');
    }
};

// middleware for form validation
const validateRegistration = (req, res, next) => {
    const { username, email, password, address, contact, role } = req.body;

    if (!username || !email || !password || !address || !contact || !role) {
        return res.status(400).send('All fields are required.');
    }
    
    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 or more characters long');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};

// define routes
app.get('/',  (req, res) => {
    res.render('index', {user: req.session.user} );
});

app.get('/inventory', checkAuthenticated, checkAdmin, (req, res) => {
    // fetch data from mysql
    connection.query('SELECT * FROM listings', (error, results) => {
      if (error) throw error;
      res.render('inventory', { listing: results, user: req.session.user });
    });
});

app.get('/register', (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
});

app.post('/register', validateRegistration, (req, res) => {

    const { username, email, password, address, contact, role } = req.body;

    const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, SHA1(?), ?, ?, ?)';
    connection.query(sql, [username, email, password, address, contact, role], (err, result) => {
        if (err) {
            throw err;
        }
        console.log(result);
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});

app.get('/login', (req, res) => {
    res.render('login', { messages: req.flash('success'), errors: req.flash('error') });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    // validate email and password
    if (!email || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }

    const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
    connection.query(sql, [email, password], (err, results) => {
        if (err) {
            throw err;
        }

        if (results.length > 0) {
            // successful login
            req.session.user = results[0]; 
            req.flash('success', 'Login successful!');
            if(req.session.user.role == 'user')
                res.redirect('/listing');
            else
                res.redirect('/inventory');
        } else {
            // invalid credentials
            req.flash('error', 'Invalid email or password.');
            res.redirect('/login');
        }
    });
});

app.get('/listing', checkAuthenticated, (req, res) => {
    // fetch data from mysql
    connection.query('SELECT * FROM listings', (error, results) => {
        if (error) throw error;
        res.render('listing', { user: req.session.user, listing: results });
      });
});

app.post('/add-to-cart/:id', checkAuthenticated, (req, res) => {
    const listingId = parseInt(req.params.id);
    const quantity = parseInt(req.body.quantity) || 1;

    connection.query('SELECT * FROM listings WHERE listingId = ?', [listingId], (error, results) => {
        if (error) throw error;

        if (results.length > 0) {
            const listing = results[0];

            // initialize cart in session if not exists
            if (!req.session.cart) {
                req.session.cart = [];
            }

            //check if product already in cart
            const existingItem = req.session.cart.find(item => item.listingId === listingId);
            if (existingItem) {
                existingItem.quantity += quantity;
            } else {
                req.session.cart.push({
                    listingId: listing.listingId,
                    listingName: listing.listingName,
                    price: listing.price,
                    description: listing.description,
                    image: listing.image
                });
            }

            res.redirect('/cart');
        } else {
            res.status(404).send("Listing not found");
        }
    });
});

app.get('/cart', checkAuthenticated, (req, res) => {
    const cart = req.session.cart || [];
    res.render('cart', { cart, user: req.session.user });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/listing/:id', checkAuthenticated, (req, res) => {
  // extract the listing id from the request parameters
  const listingId = req.params.id;

  // fetch data from mysql based on the product id
  connection.query('SELECT * FROM listings WHERE listingId = ?', [listingId], (error, results) => {
      if (error) throw error;

      // check if any listing with the given id was found
      if (results.length > 0) {
          // render html page with the product data
          res.render('listing', { listing: results[0], user: req.session.user  });
      } else {
          // if no product with the given id was found, render 404
          res.status(404).send('Listing not found');
      }
  });
});

app.get('/addListing', checkAuthenticated, (req, res) => {
    res.render('addListing', {user: req.session.user } ); 
});

app.post('/addListing', upload.single('image'),  (req, res) => {
    //extract listing data from the request body
    const { listingName, description, price} = req.body;
    let image;
    if (req.file) {
        image = req.file.filename; // save only the filename
    } else {
        image = null;
    }

    const sql = 'INSERT INTO listings (listingName, description, price, image) VALUES (?, ?, ?, ?)';
    // insert the new listing into the database
    connection.query(sql , [listingName, description, price, image], (error, results) => {
        if (error) {
            // handle any error that occurs during the database operation
            console.error("Error adding listing:", error);
            res.status(500).send('Error adding listing');
        } else {
            //redirect based on user role
            if (req.session.user.role === 'admin') {
                res.redirect('/inventory');
            } else {
                res.redirect('/listing');
            }
        }
    });
});

app.get('/updateListing/:id',checkAuthenticated, checkAdmin, (req,res) => {
    const listingId = req.params.id;
    const sql = 'SELECT * FROM listings WHERE listingId = ?';

    // fetch data from mysql based on the product id
    connection.query(sql , [listingId], (error, results) => {
        if (error) throw error;

        // check if any product with the given id was found
        if (results.length > 0) {
            // render html page with the product data
            res.render('updateListing', { listing: results[0] });
        } else {
            // if no product with the given id was found, render 404
            res.status(404).send('Listing not found');
        }
    });
});

app.post('/updateListing/:id', upload.single('image'), (req, res) => {
    const listingId = req.params.id;
    // extract product data from the request body
    const { listingName, description, price } = req.body;
    let image  = req.body.currentImage; //retrieve current image filename
    if (req.file) { //if new image is uploaded
        image = req.file.filename; // set image to be new image filename
    } 

    const sql = 'UPDATE listings SET listingName = ? , description = ?, price = ?, image =? WHERE listingId = ?';
    // insert the new product into the database
    connection.query(sql, [listingName, description, price, image, listingId], (error, results) => {
        if (error) {
            // handle error during the database operation
            console.error("Error updating listing:", error);
            res.status(500).send('Error updating list');
        } else {
            // send a success response
            res.redirect('/inventory');
        }
    });
});

app.get('/deleteListing/:id', (req, res) => {
    const listingId = req.params.id;

    connection.query('DELETE FROM listings WHERE listingId = ?', [listingId], (error, results) => {
        if (error) {
            // handle any error that occurs during the database operation
            console.error("Error deleting listing:", error);
            res.status(500).send('Error deleting listing');
        } else {
            // send a success response
            res.redirect('/inventory');
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
