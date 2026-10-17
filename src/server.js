require('dotenv').config();
const app = require('./app');

const DEFAULT_PORT = 3000;
const PORT = process.env.PORT || DEFAULT_PORT;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
