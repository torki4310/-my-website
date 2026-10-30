// ===============================================
// عدّل بياناتك ومشاريعك من هنا فقط — لا حاجة لتعديل أي ملف آخر
// ===============================================

const PROFILE = {
  name: "اسمك هنا",
  title: "مطوّر برمجيات",
  bio: "أصمّم وأبني برامج وتطبيقات عملية تحلّ مشكلات حقيقية. هنا تجد مجموعة من مشاريعي وبرامجي التي عملت عليها.",
  avatar: "", // رابط صورة شخصية (اتركه فارغاً لعرض الحرف الأول من الاسم)
  email: "you@example.com",
  links: {
    github: "https://github.com/torki4310",
    linkedin: "",
    twitter: "",
  },
  skills: ["JavaScript", "Python", "HTML & CSS", "React", "Node.js", "SQL", "Git"],
};

// أنواع المشاريع تظهر كأزرار تصفية تلقائياً
const PROJECTS = [
  {
    title: "تطبيق إدارة المهام",
    description: "تطبيق ويب لتنظيم المهام اليومية مع تذكيرات وتصنيفات ومزامنة بين الأجهزة.",
    category: "تطبيقات ويب",
    tags: ["React", "Node.js", "MongoDB"],
    image: "",
    demo: "#",
    source: "#",
    featured: true,
  },
  {
    title: "أداة تحليل البيانات",
    description: "برنامج سطر أوامر لقراءة ملفات CSV وإنتاج تقارير ورسوم بيانية تلقائياً.",
    category: "أدوات",
    tags: ["Python", "Pandas"],
    image: "",
    demo: "",
    source: "#",
    featured: false,
  },
  {
    title: "متجر إلكتروني",
    description: "متجر متكامل مع سلة مشتريات ولوحة تحكم لإدارة المنتجات والطلبات.",
    category: "تطبيقات ويب",
    tags: ["Next.js", "Stripe", "PostgreSQL"],
    image: "",
    demo: "#",
    source: "#",
    featured: true,
  },
  {
    title: "تطبيق الطقس",
    description: "تطبيق جوال يعرض حالة الطقس والتوقعات لسبعة أيام حسب موقعك.",
    category: "تطبيقات جوال",
    tags: ["Flutter", "API"],
    image: "",
    demo: "",
    source: "#",
    featured: false,
  },
  {
    title: "بوت ديسكورد",
    description: "بوت لإدارة الخوادم وتنظيم الفعاليات والرد التلقائي على الأعضاء.",
    category: "أدوات",
    tags: ["JavaScript", "Discord.js"],
    image: "",
    demo: "",
    source: "#",
    featured: false,
  },
  {
    title: "لعبة ألغاز",
    description: "لعبة متصفح بسيطة بمراحل متدرجة الصعوبة ونظام نقاط.",
    category: "ألعاب",
    tags: ["JavaScript", "Canvas"],
    image: "",
    demo: "#",
    source: "#",
    featured: false,
  },
];
