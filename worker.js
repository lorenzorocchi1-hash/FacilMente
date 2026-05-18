// Cloudflare Worker — proxy per Gemini API
// La variabile GEMINI_API_KEY va impostata nei Secret del Worker (non qui)

export default {
  async fetch(request, env) {

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError('Corpo della richiesta non valido', 400);
    }

    const { prompt, imageB64, mimeType, pdfB64 } = body;
    if (!prompt) return jsonError('Parametro prompt mancante', 400);

    // Costruisce il contenuto per Gemini
    const parts = [];

    if (imageB64 && mimeType) {
      parts.push({
        inline_data: { mime_type: mimeType, data: imageB64 }
      });
    } else if (pdfB64) {
      parts.push({
        inline_data: { mime_type: 'application/pdf', data: pdfB64 }
      });
    }

    parts.push({ text: prompt });

    const geminiPayload = {
      contents: [{ parts }],
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.3,
      }
    };

    const MODEL = 'gemini-2.5-flash';
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;

    let geminiRes;
    try {
      geminiRes = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload)
      });
    } catch (e) {
      return jsonError('Errore di rete verso Gemini: ' + e.message, 502);
    }

    const geminiData = await geminiRes.json();

    if (!geminiRes.ok) {
      const msg = geminiData?.error?.message || 'Errore Gemini sconosciuto';
      return jsonError(msg, geminiRes.status);
    }

    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return jsonError('Risposta vuota da Gemini', 502);

    return new Response(JSON.stringify({ text }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
};

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    }
  });
}
