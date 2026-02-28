// ================= IMPORT =================
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// ================= MIDDLEWARE =================
app.use(cors({
    origin: true,
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'secret123',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// ================= STATIC FOLDER =================
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/client', express.static(path.join(__dirname, 'client')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ================= DATABASE =================
const db = new sqlite3.Database('./database.db');

db.serialize(() => {

    db.run(`
        CREATE TABLE IF NOT EXISTS produk (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nama TEXT,
            harga INTEGER,
            deskripsi TEXT,
            gambar TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS admin (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
        )
    `);

    const defaultPassword = bcrypt.hashSync("admin123", 10);

    db.get("SELECT * FROM admin WHERE username = ?", ["admin"], (err, row) => {
        if (!row) {
            db.run(
                "INSERT INTO admin (username, password) VALUES (?, ?)",
                ["admin", defaultPassword]
            );
            console.log("Admin default dibuat:");
            console.log("username: admin");
            console.log("password: admin123");
        }
    });

});

// ================= UPLOAD =================
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads'),
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage });

// ================= CEK LOGIN =================
function cekLogin(req, res, next) {
    if (!req.session.admin) {
        return res.status(401).json({ message: "Harus login terlebih dahulu" });
    }
    next();
}

// ================= API =================

// LOGIN
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    db.get("SELECT * FROM admin WHERE username = ?", [username], (err, user) => {

        if (err) return res.status(500).json({ message: "Database error" });
        if (!user) return res.status(401).json({ message: "User tidak ditemukan" });

        const valid = bcrypt.compareSync(password, user.password);
        if (!valid) return res.status(401).json({ message: "Password salah" });

        req.session.admin = user.id;
        res.json({ message: "Login berhasil" });
    });
});

// LOGOUT
app.get('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ message: "Gagal logout" });
        res.json({ message: "Logout berhasil" });
    });
});

// CEK LOGIN
app.get('/api/cek-login', (req, res) => {
    res.json({ login: !!req.session.admin });
});

// ================= PRODUK =================

// AMBIL PRODUK CLIENT
app.get('/api/produk', (req, res) => {
    db.all("SELECT * FROM produk ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json(err);
        res.json(rows);
    });
});

// AMBIL PRODUK ADMIN
app.get('/api/produk-admin', cekLogin, (req, res) => {
    db.all("SELECT * FROM produk ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json(err);
        res.json(rows);
    });
});

// TAMBAH PRODUK
app.post('/api/produk', cekLogin, upload.single('gambar'), (req, res) => {

    const { nama, harga, deskripsi } = req.body;
    const gambar = req.file ? req.file.filename : null;

    db.run(
        "INSERT INTO produk (nama, harga, deskripsi, gambar) VALUES (?, ?, ?, ?)",
        [nama, harga, deskripsi, gambar],
        function (err) {
            if (err) return res.status(500).json(err);
            res.json({ message: "Produk berhasil ditambahkan" });
        }
    );
});

// EDIT PRODUK
app.put('/api/produk/:id', cekLogin, upload.single('gambar'), (req, res) => {

    const id = req.params.id;
    const { nama, harga, deskripsi } = req.body;

    db.get("SELECT gambar FROM produk WHERE id = ?", [id], (err, row) => {

        if (err || !row) {
            return res.status(404).json({ message: "Produk tidak ditemukan" });
        }

        let gambarBaru = row.gambar;

        if (req.file) {
            if (row.gambar) {
                const filePath = path.join(__dirname, 'uploads', row.gambar);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }
            gambarBaru = req.file.filename;
        }

        db.run(
            "UPDATE produk SET nama = ?, harga = ?, deskripsi = ?, gambar = ? WHERE id = ?",
            [nama, harga, deskripsi, gambarBaru, id],
            function (err) {
                if (err) {
                    return res.status(500).json({ message: "Gagal update produk" });
                }
                res.json({ message: "Produk berhasil diupdate" });
            }
        );
    });
});

// HAPUS PRODUK
app.delete('/api/produk/:id', cekLogin, (req, res) => {

    const id = req.params.id;

    db.get("SELECT gambar FROM produk WHERE id = ?", [id], (err, row) => {

        if (err || !row) {
            return res.status(404).json({ message: "Produk tidak ditemukan" });
        }

        if (row.gambar) {
            const filePath = path.join(__dirname, 'uploads', row.gambar);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        db.run("DELETE FROM produk WHERE id = ?", [id], function (err) {

            if (err) {
                return res.status(500).json({ message: "Gagal hapus produk" });
            }

            res.json({ message: "Produk berhasil dihapus" });
        });
    });
});

// ================= START SERVER =================
app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});