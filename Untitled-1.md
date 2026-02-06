You are a senior React/TypeScript developer with expertise in the LyricLens AI video production platform.

I am encountering an issue with my code. I have added console.log() statements and here are the outputs:

**Console Log Output:**
[client:733 [vite] connecting...
freesoundService.ts:43 [Freesound] API Key configured: YES
client:827 [vite] connected.
index.tsx:16 === FIREBASE STARTUP TEST ===
index.tsx:17 [Firebase] Is configured? true
index.tsx:18 [Firebase] Environment variables: {apiKey: '✓ Set', authDomain: '✓ Set', projectId: '✓ Set', storageBucket: '✓ Set', messagingSenderId: '✓ Set', …}
config.ts:49 [Firebase] Initializing app with config: {authDomain: 'ai-soul-studio-962e2.firebaseapp.com', projectId: 'ai-soul-studio-962e2'}
config.ts:54 [Firebase] App initialized successfully
index.tsx:28 [Firebase] App initialized? true
index.tsx:32 [Firebase] Auth initialized? true
index.tsx:34 [Firebase] Auth config: {appName: '[DEFAULT]', apiKey: 'AIzaSyAG3Y...', authDomain: 'ai-soul-studio-962e2.firebaseapp.com'}
index.tsx:41 === END FIREBASE TEST ===
useAuth.ts:63 [useAuth] Starting auth initialization...
authService.ts:80 [Auth] ===== CHECKING FOR REDIRECT RESULT =====
authService.ts:81 [Auth] Current URL: http://localhost:3000/signin
authService.ts:82 [Auth] Current auth state: not signed in
installHook.js:1 [useAuth] Starting auth initialization...
installHook.js:1 [Auth] ===== CHECKING FOR REDIRECT RESULT =====
installHook.js:1 [Auth] Current URL: http://localhost:3000/signin
installHook.js:1 [Auth] Current auth state: not signed in
useAuth.ts:68 [useAuth] Auth state changed: signed out
authService.ts:86 [Auth] Redirect result received: null
authService.ts:97 [Auth] No redirect result found (user did not just sign in via redirect)
authService.ts:86 [Auth] Redirect result received: null
authService.ts:97 [Auth] No redirect result found (user did not just sign in via redirect)
authService.ts:55 [Auth] Starting Google sign-in with popup...
popup.ts:302  Cross-Origin-Opener-Policy policy would block the window.closed call.
**Summary Note:** Multiple repeated warnings of Cross-Origin-Opener-Policy policy blocking window.closed call in popup.ts (these warnings repeat ~50+ times with the same stack trace pattern)
useAuth.ts:68 [useAuth] Auth state changed: fofe91@gmail.com
authService.ts:59 [Auth] Google sign-in successful: fofe91@gmail.com

**Auth Initialization Repetition Observed:**
The following auth patterns repeat multiple times throughout the logs (3-4+ times each):
- useAuth.ts:63 [useAuth] Starting auth initialization...
- authService.ts:80 [Auth] ===== CHECKING FOR REDIRECT RESULT =====
- authService.ts:81 [Auth] Current URL: http://localhost:3000/
- authService.ts:82 [Auth] Current auth state: fofe91@gmail.com
- installHook.js:1 [useAuth] Starting auth initialization...
- installHook.js:1 [Auth] ===== CHECKING FOR REDIRECT RESULT =====
- installHook.js:1 [Auth] Current URL: http://localhost:3000/
- installHook.js:1 [Auth] Current auth state: fofe91@gmail.com
- useAuth.ts:68 [useAuth] Auth state changed: fofe91@gmail.com (multiple times)
- authService.ts:86 [Auth] Redirect result received: null
- authService.ts:97 [Auth] No redirect result found (user did not just sign in via redirect) (multiple times)

After successful sign-in, auth initialization repeats on multiple routes (/, /projects, /studio?mode=story&projectId=...)
projectService.ts:370 [ProjectService] Listed 9 projects
projectService.ts:223 [ProjectService] Created project proj_1770325521894_lso8cwgo
apiClient.ts:19 [API Client] Running in browser mode (using proxy)
langsmithTracing.ts:25 [Tracing] LangSmith tracing enabled for project: pr-essential-cloth-51
sunoService.ts:112 [Suno] API Key configured: YES
logger.ts:75 [Agent:ToolRegistration] Registered tools with registry: {IMPORT: {…}, CONTENT: {…}, MEDIA: {…}, ENHANCEMENT: {…}, EXPORT: {…}}
logger.ts:75 [Agent:KnowledgeBase]  Initializing...
logger.ts:75 [Agent:KnowledgeBase] Initialized with 7 documents in 0ms
logger.ts:75 [Agent:ExampleLibrary]  ✅ Initialized
logger.ts:75 [Agent:Studio]  Phase 2 RAG enabled - knowledge base will be used

**After navigating to /studio?mode=story&projectId=proj_1770325521894_lso8cwgo:**
projectService.ts:266 [ProjectService] Loaded project proj_1770325521894_lso8cwgo (repeated)
logger.ts:72 [Agent:Persistence] Session production_proj_1770325521894_lso8cwgo not found in IndexedDB
useProjectSession.ts:100 [useProjectSession] No existing session, initializing production_proj_1770325521894_lso8cwgo
logger.ts:72 [Agent:Persistence] Saved session production_proj_1770325521894_lso8cwgo (0 scenes)
installHook.js:1  [Autosave] Cloud init error (non-fatal): TypeError: Failed to fetch

**Agent Story Generation:**
logger.ts:75 [Agent:AgentCore]  Intent analysis: {firstTool: 'generate_breakdown', hasYouTubeUrl: false, wantsAnimation: false, wantsMusic: false, detectedStyle: 'Sci-Fi', …}
logger.ts:75 [Agent:Production]  Generating story breakdown for: بحلول عام ٢١٥٠، كان البشر يظنون أنهم قد رسموا خرائط لكل فوهة وبركان خامد على سطح القمر. ولكن عندما اصطدم فريق التنقيب "أرتميس ٤"، المتمركز في "بحر السكون"، بطبقة غير قابلة للاختراق من سبيكة متقزحة على عمق ثلاثة كيلومترات، تغير العالم إلى الأبد. لم يكن ذلك صخراً بركانياً، بل كان هيكلاً لسفينة. راقب القائد إلياس ثورن تدفق البيانات بذهول. وبينما كانت الحفارات تهتز فوق المعدن، تردد طنين منخفض التردد عبر القشرة القمرية، وانتقل عبر الفراغ ليهتز في عظام الطاقم نفسه. لم تكن مجرد سفينة؛ بل كان هيكلاً عملاقاً بحجم جرم سماوي. لم يكن القمر يدور حول الأرض فحسب؛ بل كان يراقبها. ومع بداية "الصحوة"، بدأت أضواء داخلية—كانت هامدة لدهور—تومض تحت الغبار. بدأت أجزاء من السطح القمري تتحرك مثل صفائح تكتونية ضخمة، كاشفة عن فتحات هندسية زفرت غازات قديمة مضغوطة. وعلى الأرض، بدأت إبر البوصلات بالدوران بجنون. أدرك إلياس حينها أن القمر لم يكن تابعاً طبيعياً منذ مليارات السنين؛ بل كان قارب نجاة، وقد بدأ ركابه أخيراً بالاستيقاظ.
logger.ts:75 [Agent:Production]  Invoking Gemini API for story breakdown...
logger.ts:75 [Agent:Production]  Story breakdown generated successfully
useStoryGeneration.ts:376 [useStoryGeneration] Breakdown parsed into scenes: 5
installHook.js:1  [Autosave] Cloud init error (non-fatal): TypeError: Failed to fetch
    at Object.initSession (cloudStorageService.ts:158:30)
    at Object.generateBreakdown (useStoryGeneration.ts:364:31)
installHook.js:1  [useStoryGeneration] Cloud storage unavailable, using local storage only
storySync.ts:157 [StorySync] Saved story story_1770325739567 to Firestore
logger.ts:75 [Agent:AgentCore]  Intent analysis: {firstTool: 'plan_video', hasYouTubeUrl: false, wantsAnimation: false, wantsMusic: false, detectedStyle: null, …}
logger.ts:75 [Agent:Production]  Creating screenplay for: story_1770325739567
logger.ts:75 [Agent:Production]  Invoking Gemini API for screenplay...
logger.ts:75 [Agent:Production]  Screenplay generated successfully
useStoryGeneration.ts:440 [useStoryGeneration] Screenplay retrieved: 4 scenes
storySync.ts:157 [StorySync] Saved story story_1770325739567 to Firestore (repeated)
logger.ts:75 [Agent:AgentCore]  Intent analysis: {firstTool: 'generate_breakdown', hasYouTubeUrl: false, wantsAnimation: false, wantsMusic: false, detectedStyle: null, …}
logger.ts:75 [Agent:Production]  Extracting characters for: story_1770325739567
characterService.ts:113 [CharacterService] Generating reference 1/2: Commander Thorne
characterService.ts:83 [CharacterService] Generating reference sheet for: Commander Thorne
imageService.ts:348 [prompt-lint] weak_visual_specificity, weak_visual_specificity | style=Character Sheet | aspectRatio=1:1
imageService.ts:76 [ImageService] Created new seed 1578338417 for character: commander_thorne
imageService.ts:115 [ImageService] Using Imagen API with model: imagen-4.0-fast-generate-001 (seed: 1578338417)
installHook.js:1  [ProxyAIClient] Error calling /api/gemini/proxy/generateImages: Error: Proxy call failed: 500
    at ProxyAIClient.callProxy (apiClient.ts:124:15)