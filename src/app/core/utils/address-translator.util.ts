/**
 * Egyptian & Arabic Address Translation & Localization Utility.
 * Translates addresses between Arabic and English bidirectionally,
 * handling Egyptian governorates, cities, districts, streets, landmarks, and numbers.
 */

export type TargetLanguage = 'ar' | 'en';

// Phrases to match when translating Arabic to English
const AR_TO_EN_PHRASES: [RegExp, string][] = [
  // Famous Egyptian historical / street names
  [/عمر\s+بن\s+الخطاب/gi, 'Omar Ibn Al-Khattab'],
  [/(?:أبو|ابو)\s+بكر\s+الصديق/gi, 'Abu Bakr Al-Siddiq'],
  [/عثمان\s+بن\s+عفان/gi, 'Othman Ibn Affan'],
  [/علي\s+بن\s+(?:أبي|ابي)\s+طالب/gi, 'Ali Ibn Abi Talib'],
  [/خالد\s+بن\s+الوليد/gi, 'Khaled Ibn El Walid'],
  [/عمرو\s+بن\s+العاص/gi, 'Amr Ibn El Aas'],
  [/جمال\s+عبد\s*الناصر/gi, 'Gamal Abdel Nasser'],
  [/(?:أنور|انور)\s+السادات/gi, 'Anwar El Sadat'],
  [/صلاح\s+الدين/gi, 'Salah El Din'],
  [/صلاح\s+سالم/gi, 'Salah Salem'],
  [/(?:أحمد|احمد)\s+عرابي/gi, 'Ahmed Orabi'],
  [/سعد\s+زغلول/gi, 'Saad Zaghloul'],
  [/طلعت\s+حرب/gi, 'Talaat Harb'],
  [/عباس\s+العقاد/gi, 'Abbas El Akkad'],
  [/مكرم\s+عبيد/gi, 'Makram Ebeid'],
  [/مصطفى\s+النحاس/gi, 'Mostafa El Nahhas'],
  [/قصر\s+العيني/gi, 'Kasr El Aini'],
  [/جامعة\s+الدول\s*(?:العربية)?/gi, 'Gamaat El Dowal'],
  [/محي(?:ى)?\s+الدين\s+(?:أبو|ابو)\s+العز/gi, 'Mohie El Din Abou El Ezz'],
  [/البطل\s+(?:أحمد|احمد)\s+عبد\s*العزيز/gi, 'El Batal Ahmed Abdel Aziz'],
  [/عبد\s*الخالق\s+ثروت/gi, 'Abdel Khalek Tharwat'],
  [/صفية\s+زغلول/gi, 'Safia Zaghloul'],
  [/خاتم\s+المرسلين/gi, 'Khatem El Morsaleen'],
  [/الملك\s+فيصل/gi, 'King Faisal'],
  [/(?:٢٦|26)\s+يوليو/gi, '26th of July'],

  // Alexandria & North Coast
  [/(?:العجمي|العجمى)/gi, 'El Agami'],
  [/هانوفيل/gi, 'Hanoville'],
  [/البيطاش/gi, 'El Bitash'],
  [/الدخيلة/gi, 'El Dekheila'],
  [/(?:الكيلو|كيلو)\s*21/gi, 'Kilo 21'],
  [/(?:أبو|ابو)\s*تلات/gi, 'Abu Talat'],
  [/سيدي\s+بشر\s+بحري/gi, 'Sidi Bishr Bahary'],
  [/سيدي\s+بشر\s+قبلي/gi, 'Sidi Bishr Qebly'],
  [/سيدي\s+بشر/gi, 'Sidi Bishr'],
  [/ميامي/gi, 'Miami'],
  [/سموحة/gi, 'Smouha'],
  [/محرم\s+بك/gi, 'Moharam Bek'],
  [/محطة\s+الرمل/gi, 'Raml Station'],
  [/الرمل/gi, 'El Raml'],
  [/العصافرة\s+بحري/gi, 'El Asafra Bahary'],
  [/العصافرة/gi, 'El Asafra'],
  [/المنتزه/gi, 'El Montazah'],
  [/المندرة/gi, 'El Mandara'],
  [/لوران/gi, 'Loran'],
  [/ستانلي/gi, 'Stanley'],
  [/جليم/gi, 'Glim'],
  [/سابا\s+باشا/gi, 'Saba Pasha'],
  [/بولكلي/gi, 'Bolkly'],
  [/رشدي/gi, 'Roushdy'],
  [/كفر\s+عبده/gi, 'Kafr Abdu'],
  [/الشاطبي/gi, 'El Shatby'],
  [/(?:الأزاريطة|الازاريطة)/gi, 'El Azarita'],
  [/كامب\s+شيزار/gi, 'Camp Cesar'],
  [/(?:الإبراهيمية|الابراهيمية)/gi, 'El Ibrahimia'],
  [/سبورتنج/gi, 'Sporting'],
  [/كليوباترا/gi, 'Cleopatra'],
  [/سيدي\s+جابر/gi, 'Sidi Gaber'],
  [/مصطفى\s+كامل/gi, 'Mostafa Kamel'],
  [/المعمورة/gi, 'El Mamoura'],
  [/طوسون/gi, 'Tosson'],
  [/(?:أبو|ابو)\s*قير/gi, 'Abu Qir'],
  [/العامرية/gi, 'El Amreya'],
  [/برج\s+العرب\s+الجديدة/gi, 'New Borg El Arab'],
  [/برج\s+العرب/gi, 'Borg El Arab'],
  [/الورديان/gi, 'El Wardian'],
  [/مينا\s+البصل/gi, 'Mina El Basal'],
  [/كرموز/gi, 'Karmouz'],
  [/اللبان/gi, 'El Labban'],
  [/بحري/gi, 'Bahary'],
  [/(?:الأنفوشي|الانفوشي)/gi, 'El Anfoushy'],
  [/(?:الرأس|الراس)\s+السوداء/gi, 'El Ras El Soda'],
  [/السيوف/gi, 'El Seyouf'],
  [/فيكتوريا/gi, 'Victoria'],
  [/شدس/gi, 'Shedis'],
  [/جناكليس/gi, 'Gianaclis'],
  [/زيزينيا/gi, 'Zizinia'],
  [/باكوس/gi, 'Bacos'],
  [/غبريال/gi, 'Ghabrial'],
  [/العوايد/gi, 'El Awayed'],
  [/خورشيد/gi, 'Khorshid'],

  // Cairo & Giza
  [/مدينة\s+نصر/gi, 'Nasr City'],
  [/مصر\s+الجديدة/gi, 'Heliopolis'],
  [/المعادي/gi, 'Maadi'],
  [/الزمالك/gi, 'Zamalek'],
  [/الدقي/gi, 'Dokki'],
  [/المهندسين/gi, 'Mohandessin'],
  [/العجوزة/gi, 'Agouza'],
  [/الهرم/gi, 'Haram'],
  [/فيصل/gi, 'Faisal'],
  [/التجمع\s+الخامس/gi, 'Fifth Settlement'],
  [/التجمع\s+(?:الأول|الاول)/gi, 'First Settlement'],
  [/التجمع\s+الثالث/gi, 'Third Settlement'],
  [/التجمع/gi, 'New Cairo'],
  [/القاهرة\s+الجديدة/gi, 'New Cairo'],
  [/الشيخ\s+زايد/gi, 'Sheikh Zayed'],
  [/(?:السادس\s+من\s+أكتوبر|السادس\s+من\s+اكتوبر|6\s*أكتوبر|6\s*اكتوبر|٦\s*اكتوبر)/gi, '6th of October'],
  [/حدائق\s+(?:أكتوبر|اكتوبر)/gi, 'October Gardens'],
  [/الشروق/gi, 'El Shorouk'],
  [/العبور/gi, 'El Obour'],
  [/بدر/gi, 'Badr City'],
  [/العاصمة\s+(?:الإدارية|الادارية)/gi, 'New Administrative Capital'],
  [/مدينتي/gi, 'Madinaty'],
  [/الرحاب/gi, 'Al Rehab'],
  [/المستقبل/gi, 'Mostakbal City'],
  [/حلوان/gi, 'Helwan'],
  [/المعصرة/gi, 'El Maasara'],
  [/طرة/gi, 'Tora'],
  [/شبرا\s+الخيمة/gi, 'Shubra El Kheima'],
  [/شبرا/gi, 'Shubra'],
  [/عين\s+شمس/gi, 'Ain Shams'],
  [/المطرية/gi, 'El Matareya'],
  [/الزيتون/gi, 'El Zeitoun'],
  [/حدائق\s+القبة/gi, 'Hadayek El Kobba'],
  [/العباسية/gi, 'Abbassia'],
  [/وسط\s+البلد/gi, 'Downtown'],
  [/باب\s+اللوق/gi, 'Bab El Louk'],
  [/عابدين/gi, 'Abdeen'],
  [/السيدة\s+زينب/gi, 'El Sayeda Zeinab'],
  [/مصر\s+القديمة/gi, 'Old Cairo'],
  [/الفسطاط/gi, 'El Fustat'],
  [/المنيل/gi, 'El Manial'],
  [/جاردن\s+سيتي/gi, 'Garden City'],
  [/المقطم/gi, 'El Mokattam'],
  [/الهضبة\s+الوسطى/gi, 'Middle Plateau'],
  [/زهراء\s+المعادي/gi, 'Zahraa El Maadi'],
  [/المعادي\s+الجديدة/gi, 'New Maadi'],
  [/دجلة/gi, 'Degla'],
  [/المريوطية/gi, 'El Maryouteya'],
  [/المنصورية/gi, 'El Mansoureya'],
  [/العمرانية/gi, 'El Omraneya'],
  [/الطالبية/gi, 'El Talbeya'],
  [/بولاق\s+الدكرور/gi, 'Boulaq El Dakrour'],
  [/الوراق/gi, 'El Warraq'],
  [/(?:إمبابة|امبابة)/gi, 'Imbaba'],
  [/(?:أرض|ارض)\s+اللواء/gi, 'Ard El Lewaa'],
  [/ميت\s+عقبة/gi, 'Mit Akaba'],
  [/الكيت\s+كات/gi, 'Kit Kat'],
  [/بين\s+السرايات/gi, 'Bein El Sarayat'],

  // Governorates & Major Cities
  [/(?:الإسكندرية|الاسكندرية|اسكندرية)/gi, 'Alexandria'],
  [/القاهرة/gi, 'Cairo'],
  [/الجيزة/gi, 'Giza'],
  [/القليوبية/gi, 'Qalyubia'],
  [/الدقهلية/gi, 'Dakahlia'],
  [/المنصورة/gi, 'Mansoura'],
  [/الغربية/gi, 'Gharbia'],
  [/طنطا/gi, 'Tanta'],
  [/المحلة\s+الكبرى|المحلة/gi, 'El Mahalla El Kubra'],
  [/الشرقية/gi, 'Sharqia'],
  [/الزقازيق/gi, 'Zagazig'],
  [/العاشر\s+من\s+رمضان/gi, '10th of Ramadan'],
  [/المنوفية/gi, 'Monufia'],
  [/شبين\s+الكوم/gi, 'Shebin El Kom'],
  [/مدينة\s+السادات|السادات/gi, 'Sadat City'],
  [/البحيرة/gi, 'Beheira'],
  [/دمنهور/gi, 'Damanhur'],
  [/كفر\s+الدوار/gi, 'Kafr El Dawar'],
  [/رشيد/gi, 'Rosetta'],
  [/كفر\s+الشيخ/gi, 'Kafr El Sheikh'],
  [/دسوق/gi, 'Desouk'],
  [/دمياط\s+الجديدة/gi, 'New Damietta'],
  [/دمياط/gi, 'Damietta'],
  [/(?:رأس|راس)\s+البر/gi, 'Ras El Bar'],
  [/بورسعيد/gi, 'Port Said'],
  [/بورفؤاد/gi, 'Port Fouad'],
  [/(?:الإسماعيلية|الاسماعيلية)/gi, 'Ismailia'],
  [/فايد/gi, 'Fayed'],
  [/السويس/gi, 'Suez'],
  [/العين\s+السخنة/gi, 'Ain Sokhna'],
  [/البحر\s+(?:الأحمر|الاحمر)/gi, 'Red Sea'],
  [/الغردقة/gi, 'Hurghada'],
  [/الجونة/gi, 'El Gouna'],
  [/سفاجا/gi, 'Safaga'],
  [/مرسى\s+علم/gi, 'Marsa Alam'],
  [/جنوب\s+سيناء/gi, 'South Sinai'],
  [/شرم\s+الشيخ/gi, 'Sharm El Sheikh'],
  [/دهب/gi, 'Dahab'],
  [/نويبع/gi, 'Nuweiba'],
  [/طابا/gi, 'Taba'],
  [/(?:رأس|راس)\s+سدر/gi, 'Ras Sudr'],
  [/شمال\s+سيناء/gi, 'North Sinai'],
  [/العريش/gi, 'El Arish'],
  [/مرسى\s+مطروح|مطروح/gi, 'Marsa Matrouh'],
  [/الساحل\s+الشمالي/gi, 'North Coast'],
  [/مارينا/gi, 'Marina'],
  [/العلمين\s+الجديدة/gi, 'New Alamein'],
  [/العلمين/gi, 'El Alamein'],
  [/سيدي\s+عبد\s*الرحمن/gi, 'Sidi Abdel Rahman'],
  [/الضبعة/gi, 'El Dabaa'],
  [/الفيوم/gi, 'Fayoum'],
  [/بني\s+سويف/gi, 'Beni Suef'],
  [/المنيا/gi, 'Minya'],
  [/ملوي/gi, 'Mallawi'],
  [/(?:أسيوط|اسيوط)/gi, 'Assiut'],
  [/سوهاج/gi, 'Sohag'],
  [/قنا/gi, 'Qena'],
  [/نجع\s+حمادي/gi, 'Nagaa Hammadi'],
  [/(?:الأقصر|الاقصر)/gi, 'Luxor'],
  [/(?:أسوان|اسوان)/gi, 'Aswan'],
  [/كوم\s+(?:أمبو|امبو)/gi, 'Kom Ombo'],
  [/الوادي\s+الجديد/gi, 'New Valley'],
  [/مصر/gi, 'Egypt'],

  // Structural words
  [/طريق/gi, 'Rd.'],
  [/محور/gi, 'Axis'],
  [/ميدان/gi, 'Square'],
  [/(?:عمارة|مبنى)/gi, 'Bldg.'],
  [/برج/gi, 'Tower'],
  [/شقة/gi, 'Apt.'],
  [/(?:دور|طابق)/gi, 'Floor'],
  [/بلوك/gi, 'Block'],
  [/مجاورة/gi, 'Neighborhood'],
  [/حي/gi, 'District'],
  [/منطقة/gi, 'Area'],
  [/قرية/gi, 'Village'],
  [/مدينة/gi, 'City'],
  [/محافظة/gi, 'Governorate'],
  [/(?:بجوار|بجانب|جنب)/gi, 'Near'],
  [/(?:أمام|امام|قدام)/gi, 'Opposite'],
  [/خلف/gi, 'Behind'],
  [/تقاطع/gi, 'Intersection'],
  [/ناصية/gi, 'Corner']
];

// Phrases to match when translating English to Arabic
const EN_TO_AR_PHRASES: [RegExp, string][] = [
  // Famous names
  [/\bOmar\s+Ibn\s+(?:Al|El)[-\s]Khattab\b/gi, 'عمر بن الخطاب'],
  [/\bAbu\s+Bakr\s+(?:Al|El)[-\s]Sidd?iq\b/gi, 'أبو بكر الصديق'],
  [/\bOthman\s+Ibn\s+Affan\b/gi, 'عثمان بن عفان'],
  [/\bAli\s+Ibn\s+Abi\s+Talib\b/gi, 'علي بن أبي طالب'],
  [/\bGamal\s+Abdel\s*Nasser\b/gi, 'جمال عبد الناصر'],
  [/\bAnwar\s+(?:Al|El)[-\s]Sadat\b/gi, 'أنور السادات'],
  [/\bSalah\s+(?:Al|El)[-\s]Din\b/gi, 'صلاح الدين'],
  [/\bSalah\s+Salem\b/gi, 'صلاح سالم'],
  [/\bAhmed\s+Orabi\b/gi, 'أحمد عرابي'],
  [/\bSaad\s+Zaghloul\b/gi, 'سعد زغلول'],
  [/\bTalaat\s+Harb\b/gi, 'طلعت حرب'],
  [/\bAbbas\s+(?:Al|El)[-\s]Akkad\b/gi, 'عباس العقاد'],
  [/\bMakram\s+Ebeid\b/gi, 'مكرم عبيد'],
  [/\bKing\s+Faisal\b/gi, 'الملك فيصل'],

  // Alexandria & North Coast
  [/\b(?:Al|El)[-\s]Agami\b/gi, 'العجمي'],
  [/\bAgami\b/gi, 'العجمي'],
  [/\bHanoville\b/gi, 'هانوفيل'],
  [/\b(?:Al|El)[-\s]Bitash\b/gi, 'البيطاش'],
  [/\b(?:Al|El)[-\s]Dekheila\b/gi, 'الدخيلة'],
  [/\bSidi\s+Bishr\s+Bahary\b/gi, 'سيدي بشر بحري'],
  [/\bSidi\s+Bishr\b/gi, 'سيدي بشر'],
  [/\bMiami\b/gi, 'ميامي'],
  [/\bSmouha\b/gi, 'سموحة'],
  [/\bMoharam\s+Bek\b/gi, 'محرم بك'],
  [/\bRaml\s+Station\b/gi, 'محطة الرمل'],
  [/\b(?:Al|El)[-\s]Raml\b/gi, 'الرمل'],
  [/\b(?:Al|El)[-\s]Asafra\b/gi, 'العصافرة'],
  [/\b(?:Al|El)[-\s]Montazah\b/gi, 'المنتزه'],
  [/\b(?:Al|El)[-\s]Mandara\b/gi, 'المندرة'],
  [/\bLoran\b/gi, 'لوران'],
  [/\bStanley\b/gi, 'ستانلي'],
  [/\bGlim\b/gi, 'جليم'],
  [/\bRoushdy\b/gi, 'رشدي'],
  [/\bKafr\s+Abdu\b/gi, 'كفر عبده'],
  [/\b(?:Al|El)[-\s]Shatby\b/gi, 'الشاطبي'],
  [/\bCamp\s+Cesar\b/gi, 'كامب شيزار'],
  [/\b(?:Al|El)[-\s]Ibrahimia\b/gi, 'الإبراهيمية'],
  [/\bSporting\b/gi, 'سبورتنج'],
  [/\bCleopatra\b/gi, 'كليوباترا'],
  [/\bSidi\s+Gaber\b/gi, 'سيدي جابر'],
  [/\bMostafa\s+Kamel\b/gi, 'مصطفى كامل'],
  [/\b(?:Al|El)[-\s]Mamoura\b/gi, 'المعمورة'],
  [/\bAbu\s+Qir\b/gi, 'أبو قير'],
  [/\b(?:Al|El)[-\s]Amreya\b/gi, 'العامرية'],
  [/\bBorg\s+(?:Al|El)[-\s]Arab\b/gi, 'برج العرب'],

  // Cairo & Giza
  [/\bNasr\s+City\b/gi, 'مدينة نصر'],
  [/\bHeliopolis\b/gi, 'مصر الجديدة'],
  [/\bMaadi\b/gi, 'المعادي'],
  [/\bZamalek\b/gi, 'الزمالك'],
  [/\bDokki\b/gi, 'الدقي'],
  [/\bMohandessin\b/gi, 'المهندسين'],
  [/\bHaram\b/gi, 'الهرم'],
  [/\bFaisal\b/gi, 'فيصل'],
  [/\bFifth\s+Settlement\b/gi, 'التجمع الخامس'],
  [/\bNew\s+Cairo\b/gi, 'القاهرة الجديدة'],
  [/\bSheikh\s+Zayed\b/gi, 'الشيخ زايد'],
  [/\b6th\s+of\s+October\b/gi, 'السادس من أكتوبر'],
  [/\b(?:Al|El)[-\s]Shorouk\b/gi, 'الشروق'],
  [/\b(?:Al|El)[-\s]Obour\b/gi, 'العبور'],
  [/\bMadinaty\b/gi, 'مدينتي'],
  [/\bAl\s+Rehab\b/gi, 'الرحاب'],
  [/\bHelwan\b/gi, 'حلوان'],
  [/\bShubra\b/gi, 'شبرا'],
  [/\bDowntown\b/gi, 'وسط البلد'],
  [/\b(?:Al|El)[-\s]Mokattam\b/gi, 'المقطم'],
  [/\bImbaba\b/gi, 'إمبابة'],

  // Governorates
  [/\bAlexandria\b/gi, 'الإسكندرية'],
  [/\bCairo\b/gi, 'القاهرة'],
  [/\bGiza\b/gi, 'الجيزة'],
  [/\bMansoura\b/gi, 'المنصورة'],
  [/\bTanta\b/gi, 'طنطا'],
  [/\bZagazig\b/gi, 'الزقازيق'],
  [/\bDamanhur\b/gi, 'دمنهور'],
  [/\bPort\s+Said\b/gi, 'بورسعيد'],
  [/\bIsmailia\b/gi, 'الإسماعيلية'],
  [/\bSuez\b/gi, 'السويس'],
  [/\bHurghada\b/gi, 'الغردقة'],
  [/\bSharm\s+(?:Al|El)[-\s]Sheikh\b/gi, 'شرم الشيخ'],
  [/\bMarsa\s+Matrouh\b/gi, 'مرسى مطروح'],
  [/\bFayoum\b/gi, 'الفيوم'],
  [/\bBeni\s+Suef\b/gi, 'بني سويف'],
  [/\bMinya\b/gi, 'المنيا'],
  [/\bAssiut\b/gi, 'أسيوط'],
  [/\bSohag\b/gi, 'سوهاج'],
  [/\bQena\b/gi, 'قنا'],
  [/\bLuxor\b/gi, 'الأقصر'],
  [/\bAswan\b/gi, 'أسوان'],
  [/\bEgypt\b/gi, 'مصر'],

  // Building & road descriptors
  [/\b(?:Building|Bldg\.?)\b/gi, 'عمارة'],
  [/\bTower\b/gi, 'برج'],
  [/\b(?:Apartment|Apt\.?)\b/gi, 'شقة'],
  [/\bFloor\b/gi, 'دور'],
  [/\bSquare\b/gi, 'ميدان'],
  [/\bDistrict\b/gi, 'حي'],
  [/\bAxis\b/gi, 'محور'],
  [/\bCity\b/gi, 'مدينة'],
  [/\bGovernorate\b/gi, 'محافظة'],
  [/\bNear\b/gi, 'بجوار'],
  [/\bOpposite\b/gi, 'أمام'],
  [/\bBehind\b/gi, 'خلف']
];

/**
 * Checks if a string contains Arabic characters.
 */
export function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

/**
 * Translates an Arabic address string into natural English.
 */
export function translateArabicAddressToEnglish(address: string): string {
  if (!address || !address.trim()) return '';

  let text = address.trim().replace(/\s+/g, ' ');

  // Standardize street prefix: mark it so we can append 'St.' naturally in English
  let hasStreetPrefix = false;
  if (/^ش\s+/i.test(text)) {
    hasStreetPrefix = true;
    text = text.replace(/^ش\s+/i, '');
  } else if (/^شارع\s+/i.test(text)) {
    hasStreetPrefix = true;
    text = text.replace(/^شارع\s+/i, '');
  }

  // Replace known Arabic phrases with English equivalents
  for (const [regex, replacement] of AR_TO_EN_PHRASES) {
    text = text.replace(regex, replacement);
  }

  // If the address started with a street prefix, position 'St.' appropriately
  if (hasStreetPrefix) {
    text = text.replace(
      /^([A-Za-z0-9\s'-]+?)(?=\s+(?:El|Al|Hanoville|Miami|Smouha|Bldg|Apt|Floor|,|$))/i,
      '$1 St.'
    );
  }

  // Clean up English formatting: insert commas between distinct words/districts
  text = text.replace(/(\bSt\.?|\bRd\.?|\bTower|\bBldg\.?)\s+/gi, '$1, ');
  text = text.replace(
    /(El Agami|Hanoville|El Bitash|El Dekheila|Sidi Bishr|Miami|Smouha|Moharam Bek|Nasr City|Heliopolis|Maadi|Zamalek|Dokki|Haram|Faisal)\s+(Hanoville|El Bitash|El Dekheila|Alexandria|Cairo|Giza|Egypt)/gi,
    '$1, $2'
  );

  // If any Arabic remains, transliterate
  if (containsArabic(text)) {
    text = transliterateRemainingArabic(text);
  }

  // Normalize punctuation and spacing
  return text
    .replace(/،/g, ',')
    .replace(/,\s*,+/g, ',')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Translates an English address string into readable Arabic.
 */
export function translateEnglishAddressToArabic(address: string): string {
  if (!address || !address.trim()) return '';

  let text = address.trim().replace(/\s+/g, ' ');

  // Move "Street" or "St." suffix to Arabic prefix "شارع "
  text = text.replace(/([A-Za-z0-9\s'-]+?)\s+(?:Street|St\.?)\b\.?/gi, 'شارع $1');

  // Replace known English phrases with Arabic equivalents
  for (const [regex, replacement] of EN_TO_AR_PHRASES) {
    text = text.replace(regex, replacement);
  }

  // Standardize Arabic commas and clean up
  return text
    .replace(/\.،/g, '،')
    .replace(/,/g, '،')
    .replace(/،\s*،+/g, '،')
    .replace(/\s*،\s*/g, '، ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Localizes an address to the target language ('ar' or 'en').
 * If the address is already in the target script, returns it clean.
 * Otherwise, translates it.
 */
export function translateAddress(
  address: string | null | undefined,
  targetLang: TargetLanguage
): string {
  if (!address || !address.trim()) return '';
  const trimmed = address.trim();
  const isArabic = containsArabic(trimmed);

  if (targetLang === 'en') {
    return isArabic ? translateArabicAddressToEnglish(trimmed) : trimmed;
  } else {
    return isArabic ? trimmed : translateEnglishAddressToArabic(trimmed);
  }
}

/**
 * Transliteration fallback for remaining Arabic characters.
 */
function transliterateRemainingArabic(text: string): string {
  const map: Record<string, string> = {
    'ا': 'a', 'أ': 'a', 'إ': 'e', 'آ': 'aa', 'ء': "'", 'ئ': "'", 'ؤ': 'o',
    'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'g', 'ح': 'h', 'خ': 'kh',
    'د': 'd', 'ذ': 'z', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
    'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh',
    'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
    'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'a'
  };

  return text.split('').map((ch) => map[ch] ?? ch).join('');
}
