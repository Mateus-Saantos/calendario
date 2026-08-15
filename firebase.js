/* =========================================================
   Firebase — persistência online do cronograma (Firestore)
   ========================================================= */

import { initializeApp }
  from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";

// Firestore vem de um pacote separado do firebase-app.js
import { getFirestore, doc, setDoc, getDoc, collection, getDocs }
  from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAY2Z0RxYm_Xj6esvTcRTJNC-XFqlbuSVg",
  authDomain: "cronograma-escala-6de25.firebaseapp.com",
  projectId: "cronograma-escala-6de25",
  storageBucket: "cronograma-escala-6de25.firebasestorage.app",
  messagingSenderId: "196926870438",
  appId: "1:196926870438:web:006c6c5cf224b26a873567"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Gera um ID curto e legível pro cronograma (ex: "8F72A1")
function gerarId(){
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Salva (cria ou atualiza) um cronograma no Firestore.
 * - Se "id" for informado, atualiza o documento existente (mesmo link continua valendo).
 * - Se não, gera um novo id.
 * Retorna o id usado.
 */
async function salvarCronograma(dados, id){
  const cronogramaId = id || gerarId();
  await setDoc(doc(db, "cronogramas", cronogramaId), dados);
  return cronogramaId;
}

/**
 * Busca um cronograma pelo id.
 * Retorna os dados salvos, ou null se o id não existir.
 */
async function carregarCronogramaPorId(id){
  if(!id) return null;
  const snap = await getDoc(doc(db, "cronogramas", id));
  return snap.exists() ? snap.data() : null;
}

/**
 * Salva um resumo do cronograma numa coleção separada ("indice_cronogramas"),
 * usada só pelo Gerenciador pra listar todo mundo sem precisar ler o
 * cronograma completo (config + edições) de cada pessoa.
 */
async function salvarIndice(id, resumo){
  await setDoc(doc(db, "indice_cronogramas", id), resumo);
}

/**
 * Lista todos os resumos de cronogramas (usado pelo Gerenciador,
 * depois da senha confirmada).
 */
async function listarIndice(){
  const snap = await getDocs(collection(db, "indice_cronogramas"));
  const lista = [];
  snap.forEach(d => lista.push({ id: d.id, ...d.data() }));
  return lista;
}

/**
 * Busca o hash (SHA-256) da senha do Gerenciador, salvo manualmente
 * no Firestore Console em sistema/gerenciador → campo senhaHash.
 * A senha em si nunca fica no código.
 */
async function buscarHashSenhaGerenciador(){
  const snap = await getDoc(doc(db, "sistema", "gerenciador"));
  return snap.exists() ? (snap.data().senhaHash || null) : null;
}

// Exposto em window pois script.js é carregado como script separado
// (não usa import/export entre os dois arquivos).
window.firebaseCronograma = {
  salvarCronograma,
  carregarCronogramaPorId,
  gerarId,
  salvarIndice,
  listarIndice,
  buscarHashSenhaGerenciador
};