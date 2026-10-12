import express from 'express';
import cors from 'cors';
import 'dotenv/config'; // Carrega as variáveis do arquivo .env automaticamente
import cepRoutes from './src/routes/cepRoutes.js';

const app = express();

// Middlewares essenciais
app.use(cors()); // Permite que o frontend faça requisições para esta API
app.use(express.json()); // Prepara o servidor para receber e enviar dados no formato JSON

// Rota de teste simples (Health Check)
app.get('/', (req, res) => {
  res.json({ status: 'ok', mensagem: 'Microsserviço Squamata-CEP operante!' });
});

// Rotas do Squamata-cep (validação de CEP e cálculo de distância)
app.use('/api', cepRoutes);

// Configuração da porta
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
