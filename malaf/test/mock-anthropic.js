'use strict';
// خادم وهمي يحاكي واجهة Anthropic Messages (بث SSE) لاختبار مسار الذكاء الاصطناعي دون مفتاح حقيقي.
// يتعمّد إدراج "اختلاقات" (رقم سنوات خبرة، عبارة "الرائدة"، مشروع غير موجود) للتحقق من أن الحمايات تلتقطها.
const http = require('http');

function extract(tag, text) {
  const m = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : '';
}

function fullContent(facts, en) {
  const t = (ar, e) => (en ? e : ar);
  return {
    companyName: en ? facts.companyNameEn || 'Transliterated Name' : facts.companyName,
    tagline: t(`الشركة الرائدة في ${facts.activity}`, `The leading provider of ${facts.activity}`),
    about: { heading: t('من نحن', 'About Us'), body: t(`${facts.about || facts.activity}\n\nنعمل منذ 15 عامًا بخبرة متراكمة.`, `[EN] ${facts.about || facts.activity}\n\nWe have 15 years of experience.`) },
    services: { heading: t('خدماتنا', 'Our Services'), items: (facts.services || []).map((s) => ({ name: (en ? '[EN] ' : '') + s.name, description: (en ? '[EN] ' : '') + (s.desc || '') })) },
    strengths: { heading: t('ما يميزنا', 'Why Us'), items: (facts.strengths || []).map((s) => (en ? '[EN] ' : '') + s) },
    projects: {
      heading: t('أعمالنا', 'Our Work'),
      items: [...(facts.projects || []).map((p) => ({ ref: p.id, title: (en ? '[EN] ' : '') + p.title, description: (en ? '[EN] ' : '') + (p.description || '') })), { ref: 'fakeproject99', title: 'مشروع مختلق', description: 'لا يجب أن يظهر' }],
    },
    clients: { heading: t('عملاؤنا', 'Clients') },
    certifications: { heading: t('الشهادات', 'Certifications') },
    contact: { heading: t('تواصل معنا', 'Contact') },
    labels: { founded: t('تأسست عام', 'Founded'), cities: t('نخدم', 'Serving'), client: t('العميل', 'Client'), year: t('السنة', 'Year') },
    cities: (facts.cities || []).map((c) => (en ? `[EN] ${c}` : c)),
    address: facts.address ? (en ? `[EN] ${facts.address}` : facts.address) : '',
    missing_info: [t('هل لديكم اسم رسمي بالإنجليزية؟', 'Do you have an official English name?')],
  };
}

function start(port = 0) {
  const log = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const json = JSON.parse(body || '{}');
      log.push({ url: req.url, headers: req.headers, body: json });
      const prompt = json.messages[0].content;
      const schema = json.output_config.format.schema;
      const facts = JSON.parse(extract('company_input', prompt) || '{}');
      const en = /in English/.test(prompt.split('\n')[0]) || /to English/.test(prompt.split('\n')[0]);
      let out;
      if (schema.properties.missing_info) out = fullContent(facts, en);
      else {
        const current = JSON.parse(extract('current_section', prompt));
        out = JSON.parse(JSON.stringify(current));
        if (out.body !== undefined) out.body = out.body + (en ? ' (rewritten)' : ' (أعيدت صياغته)');
        if (out.tagline !== undefined) out.tagline += ' *';
      }
      const text = JSON.stringify(out);
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'request-id': 'req_mock' });
      const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      send('message_start', { type: 'message_start', message: { id: 'msg_mock', type: 'message', role: 'assistant', model: json.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 1 } } });
      send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
      for (let i = 0; i < text.length; i += 200) send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(i, i + 200) } });
      send('content_block_stop', { type: 'content_block_stop', index: 0 });
      send('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 500 } });
      send('message_stop', { type: 'message_stop' });
      res.end();
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ server, port: server.address().port, log })));
}

module.exports = { start };
