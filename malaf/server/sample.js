'use strict';
// شركة افتراضية بالكامل لعرض النموذج في الصفحة الرئيسية وللاختبارات. أي تشابه مع شركة حقيقية غير مقصود.
const { sanitizeInput, sanitizeDesign, defaultSections } = require('./schema');

const input = sanitizeInput({
  companyName: 'شركة المثال للخدمات الفنية (شركة افتراضية)',
  companyNameEn: 'Al-Mithal Technical Services (fictional company)',
  activity: 'صيانة أنظمة التكييف والكهرباء للمباني التجارية والسكنية',
  foundedYear: '2016',
  cities: ['الرياض', 'الخرج'],
  about:
    'نقدم خدمات الصيانة الدورية والطارئة لأنظمة التكييف المركزي والكهرباء. لدينا فريق فني يعمل بنظام المناوبات، ونستخدم نظامًا إلكترونيًا لمتابعة البلاغات.',
  services: [
    { name: 'صيانة التكييف المركزي', desc: 'فحص دوري وتنظيف وتغيير قطع' },
    { name: 'الصيانة الكهربائية', desc: 'لوحات التوزيع والإنارة والتمديدات' },
    { name: 'عقود الصيانة السنوية', desc: 'زيارات مجدولة وتقرير بعد كل زيارة' },
    { name: 'الأعطال الطارئة', desc: 'استقبال البلاغات على مدار الساعة' },
  ],
  strengths: ['فريق يعمل بنظام المناوبات', 'تقرير مكتوب بعد كل زيارة', 'نظام إلكتروني لمتابعة البلاغات'],
  projects: [
    { id: 'sampleproj01', title: 'عقد صيانة مجمع مكتبي', client: '', year: '2023', desc: 'صيانة دورية لأنظمة التكييف والكهرباء في مجمع مكتبي من أربعة مبانٍ.' },
    { id: 'sampleproj02', title: 'تحديث لوحات كهربائية لمدرسة أهلية', client: '', year: '2022', desc: 'استبدال لوحات التوزيع القديمة وتنظيم التمديدات.' },
  ],
  clients: [],
  certifications: [],
  contact: { phone: '+966 5X XXX XXXX', email: 'info@example.com', website: 'www.example.com', address: 'الرياض — عنوان افتراضي' },
  colors: { primary: '#0f4c5c', accent: '#e09f3e' },
});

const content = {
  ar: {
    companyName: 'شركة المثال للخدمات الفنية (شركة افتراضية)',
    tagline: 'صيانة أنظمة التكييف والكهرباء للمباني التجارية والسكنية',
    about: {
      heading: 'من نحن',
      body:
        'تأسست شركة المثال للخدمات الفنية عام 2016، وتقدم خدمات الصيانة الدورية والطارئة لأنظمة التكييف المركزي والكهرباء في الرياض والخرج.\n\nيعمل فريقنا الفني بنظام المناوبات، ونتابع كل بلاغ عبر نظام إلكتروني يتيح للعميل معرفة حالة الطلب حتى إغلاقه.',
    },
    services: {
      heading: 'خدماتنا',
      items: [
        { name: 'صيانة التكييف المركزي', description: 'فحص دوري وتنظيف للوحدات وتغيير القطع عند الحاجة للحفاظ على كفاءة التشغيل.' },
        { name: 'الصيانة الكهربائية', description: 'صيانة لوحات التوزيع وأنظمة الإنارة والتمديدات الكهربائية.' },
        { name: 'عقود الصيانة السنوية', description: 'زيارات مجدولة على مدار العام، مع تقرير مكتوب بعد كل زيارة.' },
        { name: 'الأعطال الطارئة', description: 'استقبال البلاغات على مدار الساعة وتوجيه الفريق المناوب.' },
      ],
    },
    strengths: { heading: 'ما يميزنا', items: ['فريق فني يعمل بنظام المناوبات', 'تقرير مكتوب بعد كل زيارة صيانة', 'نظام إلكتروني لمتابعة البلاغات حتى إغلاقها'] },
    projects: {
      heading: 'من أعمالنا',
      items: [
        { ref: 'sampleproj01', title: 'عقد صيانة مجمع مكتبي', description: 'صيانة دورية لأنظمة التكييف والكهرباء في مجمع مكتبي يضم أربعة مبانٍ.' },
        { ref: 'sampleproj02', title: 'تحديث لوحات كهربائية لمدرسة أهلية', description: 'استبدال لوحات التوزيع القديمة وإعادة تنظيم التمديدات الكهربائية.' },
      ],
    },
    clients: { heading: 'عملاؤنا' },
    certifications: { heading: 'الشهادات' },
    contact: { heading: 'تواصل معنا' },
    labels: { founded: 'تأسست عام', cities: 'نخدم', client: 'العميل', year: 'السنة' },
    cities: ['الرياض', 'الخرج'],
  },
  en: {
    companyName: 'Al-Mithal Technical Services (fictional company)',
    tagline: 'HVAC and electrical maintenance for commercial and residential buildings',
    about: {
      heading: 'About Us',
      body:
        'Founded in 2016, Al-Mithal Technical Services provides scheduled and emergency maintenance for central air-conditioning and electrical systems in Riyadh and Al-Kharj.\n\nOur technical team works in shifts, and every service request is tracked through an online system so clients can follow it until it is closed.',
    },
    services: {
      heading: 'Our Services',
      items: [
        { name: 'Central AC Maintenance', description: 'Routine inspection, cleaning and parts replacement to keep systems running efficiently.' },
        { name: 'Electrical Maintenance', description: 'Maintenance of distribution panels, lighting and electrical wiring.' },
        { name: 'Annual Maintenance Contracts', description: 'Scheduled visits throughout the year, with a written report after each visit.' },
        { name: 'Emergency Repairs', description: 'Service requests received around the clock and routed to the on-shift team.' },
      ],
    },
    strengths: { heading: 'Why Choose Us', items: ['A technical team working in shifts', 'A written report after every maintenance visit', 'An online system to track each request until it is closed'] },
    projects: {
      heading: 'Selected Work',
      items: [
        { ref: 'sampleproj01', title: 'Office Complex Maintenance Contract', description: 'Routine HVAC and electrical maintenance for an office complex of four buildings.' },
        { ref: 'sampleproj02', title: 'Electrical Panel Upgrade for a Private School', description: 'Replacement of old distribution panels and reorganisation of electrical wiring.' },
      ],
    },
    clients: { heading: 'Our Clients' },
    certifications: { heading: 'Certifications' },
    contact: { heading: 'Contact Us' },
    labels: { founded: 'Founded', cities: 'Serving', client: 'Client', year: 'Year' },
    cities: ['Riyadh', 'Al-Kharj'],
    address: 'Riyadh — fictional address',
  },
};

function project(template) {
  const inp = JSON.parse(JSON.stringify(input));
  return {
    id: 'sample0000',
    ownerId: 'sample',
    input: inp,
    languages: ['ar', 'en'],
    content: JSON.parse(JSON.stringify(content)),
    design: sanitizeDesign({ template: template === 'visual' ? 'visual' : 'formal', sections: defaultSections() }, inp),
    files: [],
  };
}

module.exports = { project, input };
