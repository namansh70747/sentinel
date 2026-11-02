import { Client,Connection } from "@temporalio/client";
import { dispatchOne } from "./dispatch";
import { Worker, NativeConnection } from '@temporalio/worker';
import { SentinelDatabase } from '@sentinel/db';
import { createActivities } from './activities';
import { fileURLToPath } from 'node:url';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const db = new SentinelDatabase(process.env.DATABASE_URL);
const connection = await NativeConnection.connect({ address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233' });
const clientConnection=await Connection.connect({address:process.env.TEMPORAL_ADDRESS??"localhost:7233"});
const client=new Client({connection:clientConnection});
let running=false;
const poller=setInterval(async()=>{
 if(running)return;running=true;
 try{await dispatchOne(db,client);}catch(error){console.error("Investigation dispatch failed",error instanceof Error?error.message:"unknown error");}finally{running=false;}
},1000);
try {
 const worker = await Worker.create({ connection, taskQueue:'sentinel-read', workflowsPath:fileURLToPath(new URL('../../../packages/workflows/src/index.ts',import.meta.url)), activities:createActivities(db) });
 await worker.run();
} finally { clearInterval(poller); await clientConnection.close(); await connection.close(); await db.close(); }
