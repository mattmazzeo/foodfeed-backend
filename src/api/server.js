const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const plaidRoutes = require('./routes/plaidRoutes');

dotenv.config({ path: './config/.env' });

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

app.use('/api/plaid', plaidRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
