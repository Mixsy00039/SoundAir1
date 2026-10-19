export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const [{ initDatabase }, { initMqtt }] = await Promise.all([
      import('./server/db'),
      import('./server/mqttService')
    ]);

    await initDatabase();
    await initMqtt();
  }
}
