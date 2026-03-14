const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../models/db");

const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res
        .status(400)
        .json({ success: false, message: "Username and password required" });

    // Search by username OR email
    const userResult = await db.query(
      "SELECT * FROM users WHERE username = $1 OR email = $1",
      [username]
    );
    if (userResult.rows.length === 0)
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });

    const user = userResult.rows[0];
    if (!user.is_active)
      return res
        .status(403)
        .json({ success: false, message: "Account is deactivated" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });

    let extraData = {};
    if (user.role === "merchant") {
      const merchantResult = await db.query(
        "SELECT id, merchant_name, commission_rate, agent_commission_rate, api_key FROM merchants WHERE user_id = $1",
        [user.id]
      );
      if (merchantResult.rows.length > 0) {
        extraData.merchant = merchantResult.rows[0];
      }
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, ...extraData },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        ...extraData,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getProfile = async (req, res) => {
  try {
    const userResult = await db.query(
      "SELECT id, name, email, role, is_active, created_at FROM users WHERE id = $1",
      [req.user.id],
    );
    if (userResult.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    res.json({ success: true, user: userResult.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = { login, getProfile };
