import { initDatabase } from './db';
import { initMqtt } from './mqttService';

let initialization: Promise<void> | undefined;

export function initializeServices(): Promise<void> {
  if (initialization) return initialization;

  initialization = (async () => {
    await initDatabase();
    await initMqtt();
  })().catch(error => {
    initialization = undefined;
    throw error;
  });

  return initialization;
}
