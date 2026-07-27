const { deleteCollection, createCollection } = require('./vectorStore');

async function reset() {
  await deleteCollection();
  await createCollection();
  console.log('Reset complete');
}

reset().catch(err => {
  console.error(err);
  process.exit(1);
});
