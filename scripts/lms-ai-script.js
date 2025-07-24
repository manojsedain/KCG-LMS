(function() {
    'use strict';
    
    // ===== GM COMPATIBILITY LAYER =====
    // Provide fallbacks for Tampermonkey functions when running in regular browser context
    if (typeof GM_setValue === 'undefined') {
        window.GM_setValue = function(key, value) {
            try {
                localStorage.setItem('gm_' + key, JSON.stringify(value));
            } catch (e) {
                console.warn('[LMS AI] Failed to save to localStorage:', e);
            }
        };
    }
    
    if (typeof GM_getValue === 'undefined') {
        window.GM_getValue = function(key, defaultValue) {
            try {
                const stored = localStorage.getItem('gm_' + key);
                return stored !== null ? JSON.parse(stored) : defaultValue;
            } catch (e) {
                console.warn('[LMS AI] Failed to read from localStorage:', e);
                return defaultValue;
            }
        };
    }
    
    if (typeof GM_deleteValue === 'undefined') {
        window.GM_deleteValue = function(key) {
            try {
                localStorage.removeItem('gm_' + key);
            } catch (e) {
                console.warn('[LMS AI] Failed to delete from localStorage:', e);
            }
        };
    }
    
    if (typeof GM_xmlhttpRequest === 'undefined') {
        window.GM_xmlhttpRequest = function(options) {
            const xhr = new XMLHttpRequest();
            xhr.open(options.method || 'GET', options.url);
            
            if (options.headers) {
                for (const header in options.headers) {
                    xhr.setRequestHeader(header, options.headers[header]);
                }
            }
            
            xhr.onload = function() {
                if (options.onload) {
                    options.onload({
                        status: xhr.status,
                        statusText: xhr.statusText,
                        responseText: xhr.responseText,
                        responseHeaders: xhr.getAllResponseHeaders()
                    });
                }
            };
            
            xhr.onerror = function() {
                if (options.onerror) {
                    options.onerror({
                        status: xhr.status,
                        statusText: xhr.statusText
                    });
                }
            };
            
            xhr.send(options.data || null);
        };
    }
    
    if (typeof GM_notification === 'undefined') {
        window.GM_notification = function(options) {
            // Fallback to browser notification API or console
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(options.title || 'LMS AI Assistant', {
                    body: options.text,
                    icon: options.image
                });
            } else {
                console.log('[LMS AI Notification]', options.title || 'LMS AI Assistant', ':', options.text);
            }
        };
    }
    
    if (typeof GM_addStyle === 'undefined') {
        window.GM_addStyle = function(css) {
            const style = document.createElement('style');
            style.textContent = css;
            document.head.appendChild(style);
        };
    }
    
    if (typeof GM_setClipboard === 'undefined') {
        window.GM_setClipboard = function(text) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).catch(e => {
                    console.warn('[LMS AI] Failed to copy to clipboard:', e);
                });
            } else {
                // Fallback for older browsers
                const textarea = document.createElement('textarea');
                textarea.value = text;
                document.body.appendChild(textarea);
                textarea.select();
                try {
                    document.execCommand('copy');
                } catch (e) {
                    console.warn('[LMS AI] Failed to copy to clipboard:', e);
                }
                document.body.removeChild(textarea);
            }
        };
    }
    
    if (typeof GM_registerMenuCommand === 'undefined') {
        window.GM_registerMenuCommand = function(name, callback) {
            // In regular browser context, we can't add menu commands
            // Just log for debugging
            console.log('[LMS AI] Menu command registered:', name);
        };
    }
    
    if (typeof GM_info === 'undefined') {
        window.GM_info = {
            script: {
                name: 'LMS AI Assistant',
                version: '8.2.1'
            }
        };
    }
    
    // Debug initialization
    console.log('[LMS AI] Updated script started loading...');
    console.log('[LMS AI] Current URL:', window.location.href);
    console.log('[LMS AI] GM compatibility layer initialized');
    console.log('[LMS AI] Running in context:', typeof GM_setValue !== 'undefined' ? 'Tampermonkey' : 'Browser');

    // ===== UPDATED CONFIGURATION =====
    const CONFIG = {
        VERSION: '8.2.1',
        SYSTEM_PROMPT: `You are a Japanese language expert (N1-N4 level). For all questions:
- Output only answers in format: 1-A, 2-B, 3-C
- No explanations, guesses, or extra comments
- For ★ questions: arrange A,B,C,D into grammatically correct phrase
- Format: * (A) ○○○ (B) ××× (C) △△△ (D) □□□ *
- For Text Editor: output correct word/phrase, use hiragana for difficult kanji (N3+)
- For reading questions: answer only in hiragana
- For ア,イ choices: answer only symbol (e.g.,ア)
- For true/false: answer only "◯" or "☓"
- For WH questions: answer briefly like "〜です。"
- Always add A/B/C/D labels to options
- Use only free/basic models, no GPT-4`,

        USER_PROMPT_HEADER: `Output only the confirmed correct answers. However, strictly follow these rules:
1. Think as a Japanese speaker (N1-N4 level).
2. Output only the answer (e.g.,1-A,2-B,3-A). Do not add explanations, guesses, or extra comments.
3. Processing by question type:
- For "次の文の（ ）に入れるのに最もよいものを、A・B・C・Dから一つ選びなさい。":
→ Output only number and choice (A/B/C/D) (e.g.,1-A).
– For questions like 「次の文の★に入る最もよいものを、A・B・C・Dから一つずつ選びなさい」:
– Arrange all four options (A,B,C,D) into a single grammatically correct phrase in the proper order to fill the blank(s).
– Output each chosen option's content preceded by its original capital letter in brackets, followed by a space.
– Always surround this answer with extra spaces and asterisks before and after it, then continue with the other answers.
– Output only the correct answers. Do not guess. Do not add explanations or extra text.
– Use this exact format:
* (A) ○○○ (B) ××× (C) △△△ (D) □□□ *
- If question contains "Text Editor" etc.:
→ Output only correct word/phrase for blank. Use hiragana for difficult kanji (N3+), keep N1-N4 kanji as-is.
- For reading questions: answer only in hiragana.
- For choices like ア,イ: answer only symbol (e.g.,ア).
- For true/false: answer only "◯" or "☓".
- For WH questions: answer briefly like "〜です。".
4. Always add A/B/C/D labels to options (e.g.,A xxx,B yyy,C zzz,D www).
5. Do not use GPT-4/expert models; only free/basic models.
Now, please respond to the following questions strictly in accordance with the given rules:`,

        API_ENDPOINTS: {
            deepseek: 'https://api.deepseek.com/v1/chat/completions',
            openai: 'https://api.openai.com/v1/chat/completions',
            claude: 'https://api.anthropic.com/v1/messages'
        },

        ENCRYPTION: {
            salt: 'MySuperSecretSalt2025!@#',
            algorithm: 'AES-256-GCM'
        },

        UI: {
            THROTTLE_DELAY: 100,
            FADE_DURATION: 300,
            HIDE_DELAY: 3000,
            MOBILE_BREAKPOINT: 768,
            ANIMATION_EASING: 'cubic-bezier(0.4, 0, 0.2, 1)',
            HARDCORE_ANIMATION_SPEED: 37 // 75% faster
        },

        CACHE: {
            TTL: 300000,
            MAX_ENTRIES: 1
        },
        
        LICENSE: {
            KEY_PATTERN: /^WRONG-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-NUMBER$/,
            CHECK_INTERVAL: 120000
        }
    };

    // ===== ENHANCED UTILITIES =====
    class Utils {
        static isMobile() {
            return window.innerWidth < CONFIG.UI.MOBILE_BREAKPOINT;
        }

        static debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }

        static throttle(func, limit) {
            let inThrottle;
            return function() {
                const args = arguments;
                const context = this;
                if (!inThrottle) {
                    func.apply(context, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        }

        static async sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        static generateId() {
            return Math.random().toString(36).substr(2, 9);
        }

        static sanitizeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }

        static estimateTokens(text) {
            const englishChars = (text.match(/[a-zA-Z0-9\s]/g) || []).length;
            const japaneseChars = (text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g) || []).length;
            const otherChars = text.length - englishChars - japaneseChars;
            
            return Math.ceil(englishChars / 4) + Math.ceil(japaneseChars / 1.5) + Math.ceil(otherChars / 3);
        }

        static cleanText(text) {
            return text.replace(/\s+/g, ' ')
                      .replace(/\n\s*\n/g, '\n')
                      .trim();
        }
        
        static toastElement = null;
        static toastTimeout = null;
        
        static showToast(message, type = 'info') {
            if (Utils.toastTimeout) {
                clearTimeout(Utils.toastTimeout);
                Utils.toastTimeout = null;
            }
            if (Utils.toastElement) {
                Utils.toastElement.remove();
            }
            
            Utils.toastElement = document.createElement('div');
            Utils.toastElement.className = `ai-toast ai-toast-${type}`;
            Utils.toastElement.innerHTML = `
                <div class="toast-content">
                    <span class="toast-message">${message}</span>
                </div>
            `;
            document.body.appendChild(Utils.toastElement);
            
            requestAnimationFrame(() => {
                Utils.toastElement.classList.add('visible');
            });
            
            Utils.toastTimeout = setTimeout(() => {
                Utils.toastElement.classList.remove('visible');
                setTimeout(() => {
                    if (Utils.toastElement) {
                        Utils.toastElement.remove();
                        Utils.toastElement = null;
                    }
                }, 300);
            }, 3000);
        }

        // NEW: Show stealth message (for hardcore/emergency mode)
        static showStealthMessage(message, duration = 2000) {
            const stealthOutput = document.getElementById('ai-stealth-output');
            if (!stealthOutput) return;
            
            stealthOutput.textContent = message;
            stealthOutput.classList.add('visible');
            
            setTimeout(() => {
                stealthOutput.classList.remove('visible');
            }, duration);
        }
    }

    // ===== OPTIMIZED ENCRYPTION MODULE =====
    class Encryption {
        static encode(data) {
            try {
                const saltRotated = CONFIG.ENCRYPTION.salt.split('').reverse().join('');
                const combined = saltRotated + data;
                const encoded = btoa(unescape(encodeURIComponent(combined)));
                return encoded;
            } catch (error) {
                console.error('[LMS AI] Encryption error:', error);
                throw new Error('Encryption failed');
            }
        }

        static decode(encodedData) {
            try {
                const saltRotated = CONFIG.ENCRYPTION.salt.split('').reverse().join('');
                const decoded = decodeURIComponent(escape(atob(encodedData)));
                
                if (decoded.startsWith(saltRotated)) {
                    return decoded.substring(saltRotated.length);
                }
                return decoded;
            } catch (error) {
                console.error('[LMS AI] Decryption error:', error);
                return '';
            }
        }
    }

    // ===== OPTIMIZED LICENSE MANAGER =====
    class LicenseManager {
        constructor() {
            this.status = 'invalid';
            this.expiration = null;
            this.lastChecked = 0;
            this.registeredMessageShown = GM_getValue('registered_message_shown', false);
            this.checkLicense();
        }
        
        checkLicense() {
            if (Date.now() - this.lastChecked < 5000) return;
            this.lastChecked = Date.now();
            
            const productKey = GM_getValue('product_key', '');
            
            if (productKey && CONFIG.LICENSE.KEY_PATTERN.test(productKey)) {
                this.status = 'valid';
                this.expiration = null;
                
                if (!this.registeredMessageShown) {
                    Utils.showToast('REGISTERED', 'success');
                    GM_setValue('registered_message_shown', true);
                    this.registeredMessageShown = true;
                }
            } else {
                this.status = 'invalid';
                this.expiration = null;
                this.registeredMessageShown = false;
                GM_setValue('registered_message_shown', false);
            }

            if (window.lmsAI?.uiManager) {
                window.lmsAI.uiManager.updateSettingsButtonVisibility();
            }
        }
        
        resetRegisteredMessage() {
            this.registeredMessageShown = false;
            GM_setValue('registered_message_shown', false);
        }
        
        isValid() {
            return this.status === 'valid';
        }
        
        isExpired() {
            return this.status === 'invalid';
        }
        
        saveProductKey(key) {
            if (!CONFIG.LICENSE.KEY_PATTERN.test(key)) {
                throw new Error('Invalid product key format');
            }
            
            GM_setValue('product_key', key);
            this.resetRegisteredMessage();
            this.checkLicense();
            Utils.showToast('Product key saved successfully!', 'success');
        }
        
        removeProductKey() {
            GM_setValue('product_key', '');
            this.resetRegisteredMessage();
            this.checkLicense();
        }
    }

    // ===== CACHE MODULE =====
    class Cache {
        constructor() {
            this.cache = new Map();
        }

        set(key, value, ttl = CONFIG.CACHE.TTL) {
            this.cache.clear();
            const expiry = Date.now() + ttl;
            this.cache.set(key, { value, expiry });
        }

        get(key) {
            const item = this.cache.get(key);
            if (!item) return null;
            if (Date.now() > item.expiry) {
                this.cache.delete(key);
                return null;
            }
            return item.value;
        }

        clear() {
            this.cache.clear();
        }
    }
// ===== DOM-BASED QUESTION PARSER (PRIMARY) =====
    class QuestionParser {
        static fallbackPatterns = {
            question: /Question\s+\d+[\s\S]*?(?=Question\s+\d+|Additional content|Continue|$)/gi,
            mcq: /^[A-D]\.\s*.+$/gm,
            fillInBlank: /（\s*）|★|_+/g,
            truefalse: /正しい|間違い|true|false/gi,
            matching: /次の.*?組み合わせ/gi,
            reading: /読み方|ひらがな|カタカナ/gi,
            pointPattern: /^\s*\d+\s*Point\s*$/i,
            questionHeader: /^Question\s+\d+$/i
        };

        static extractQuestions() {
            console.log('[LMS AI] Starting DOM-based question extraction...');
            
            try {
                // Primary method: DOM-based extraction
                const domQuestions = this.extractQuestionsFromDOM();
                
                if (domQuestions && domQuestions.length > 0) {
                    console.log('[LMS AI] DOM-based extraction successful:', domQuestions.length, 'questions found');
                    return domQuestions;
                }
                
                console.log('[LMS AI] DOM-based extraction failed, falling back to text-based...');
                
                // Fallback method: Text-based extraction
                const textQuestions = this.extractQuestionsFromText();
                
                if (textQuestions && textQuestions.length > 0) {
                    console.log('[LMS AI] Text-based extraction successful:', textQuestions.length, 'questions found');
                    return textQuestions;
                }
                
                console.log('[LMS AI] No questions found with either method');
                return [];
                
            } catch (error) {
                console.error('[LMS AI] Question extraction error:', error);
                console.log('[LMS AI] Attempting fallback extraction...');
                
                try {
                    return this.extractQuestionsFromText();
                } catch (fallbackError) {
                    console.error('[LMS AI] Fallback extraction also failed:', fallbackError);
                    return [];
                }
            }
        }

        static extractQuestionsFromDOM() {
            const questions = [];
            const questionElements = document.querySelectorAll('bb-assessment-question');
            
            console.log('[LMS AI] Found', questionElements.length, 'question elements in DOM');
            
            questionElements.forEach((element, index) => {
                try {
                    const questionData = this.parseQuestionElement(element, index + 1);
                    if (questionData) {
                        questions.push(questionData);
                    }
                } catch (error) {
                    console.error('[LMS AI] Error parsing question element:', error);
                }
            });
            
            return questions;
        }

        static parseQuestionElement(element, questionNumber) {
            // Get question number
            const questionLabel = element.querySelector('.question-label');
            const actualNumber = questionLabel ? 
                questionLabel.textContent.replace(/Question\s+/i, '').trim() : 
                questionNumber.toString();
            
            // Get question text
            const questionTextElement = element.querySelector('.question-content .ql-editor, .question-container .ql-editor');
            if (!questionTextElement) {
                console.warn('[LMS AI] No question text found for question', actualNumber);
                return null;
            }
            
            const questionText = Utils.cleanText(questionTextElement.innerText);
            
            // Determine question type and extract accordingly
            const questionType = this.detectQuestionType(element);
            console.log('[LMS AI] Question', actualNumber, 'type:', questionType);
            
            switch (questionType) {
                case 'multipleChoice':
                    return this.parseMultipleChoiceQuestion(element, actualNumber, questionText);
                case 'singleChoice':
                    return this.parseSingleChoiceQuestion(element, actualNumber, questionText);
                case 'fillInWithOptions':
                    return this.parseFillInWithOptionsQuestion(element, actualNumber, questionText);
                case 'textAnswer':
                    return this.parseTextAnswerQuestion(element, actualNumber, questionText);
                default:
                    console.warn('[LMS AI] Unknown question type for question', actualNumber);
                    return this.parseGenericQuestion(element, actualNumber, questionText);
            }
        }

        static detectQuestionType(element) {
            // Check for multiple choice containers
            const multipleChoiceContainer = element.querySelector('.multiple-answer-answers-container');
            if (multipleChoiceContainer) {
                // Check if single or multiple selection
                const singleChoiceInput = element.querySelector('[ng-if="questionAttempt.question.singleCorrectAnswer"]');
                return singleChoiceInput ? 'singleChoice' : 'multipleChoice';
            }
            
            // Check for text answer with options in question text
            const questionText = element.querySelector('.question-content .ql-editor, .question-container .ql-editor');
            if (questionText) {
                const text = questionText.innerText;
                if (text.includes('選択肢:') || text.includes('A．') || text.includes('ア・') || text.includes('A.')) {
                    return 'fillInWithOptions';
                }
            }
            
            // Check for pure text answer
            const textAnswerContainer = element.querySelector('.question-answer-container bb-rich-text-editor');
            if (textAnswerContainer) {
                return 'textAnswer';
            }
            
            return 'unknown';
        }

        static parseMultipleChoiceQuestion(element, questionNumber, questionText) {
            const options = this.extractOptionsFromDOM(element);
            const formattedQuestion = this.formatQuestion(questionNumber, questionText, options);
            return formattedQuestion;
        }

        static parseSingleChoiceQuestion(element, questionNumber, questionText) {
            const options = this.extractOptionsFromDOM(element);
            const formattedQuestion = this.formatQuestion(questionNumber, questionText, options);
            return formattedQuestion;
        }

        static parseFillInWithOptionsQuestion(element, questionNumber, questionText) {
            // Options are embedded in question text
            const options = this.extractOptionsFromQuestionText(questionText);
            const formattedQuestion = this.formatQuestion(questionNumber, questionText, options);
            return formattedQuestion;
        }

        static parseTextAnswerQuestion(element, questionNumber, questionText) {
            // Pure text answer, no options
            const formattedQuestion = this.formatQuestion(questionNumber, questionText, []);
            return formattedQuestion;
        }

        static parseGenericQuestion(element, questionNumber, questionText) {
            // Generic parsing as fallback
            const options = this.extractOptionsFromDOM(element) || this.extractOptionsFromQuestionText(questionText);
            const formattedQuestion = this.formatQuestion(questionNumber, questionText, options);
            return formattedQuestion;
        }

        static extractOptionsFromDOM(element) {
            const options = [];
            const optionElements = element.querySelectorAll('.option-answer');
            
            optionElements.forEach((optionElement, index) => {
                const optionLetter = String.fromCharCode(65 + index); // A, B, C, D...
                const optionTextElement = optionElement.querySelector('.ql-editor');
                
                if (optionTextElement) {
                    const optionText = Utils.cleanText(optionTextElement.innerText);
                    options.push(`${optionLetter} ${optionText}`);
                }
            });
            
            return options;
        }

        static extractOptionsFromQuestionText(questionText) {
            const options = [];
            
            // Japanese format (ア・, イ・, ウ・, エ・, オ・)
            const japaneseMatches = questionText.match(/[ア-ヲ]・[^\n\r]+/g);
            if (japaneseMatches) {
                japaneseMatches.forEach((match, index) => {
                    const letter = String.fromCharCode(65 + index);
                    const content = match.replace(/[ア-ヲ]・/, '').trim();
                    options.push(`${letter} ${content}`);
                });
                return options;
            }
            
            // Standard format (A., B., C., D.)
            const standardMatches = questionText.match(/[A-Z]\.?\s*[^\n\r]+/g);
            if (standardMatches) {
                standardMatches.forEach(match => {
                    const cleaned = match.replace(/^[A-Z]\.?\s*/, '');
                    const letter = match.charAt(0);
                    options.push(`${letter} ${cleaned.trim()}`);
                });
                return options;
            }
            
            return options;
        }

        static formatQuestion(questionNumber, questionText, options) {
            let formatted = `Question ${questionNumber}\n${questionText}`;
            
            if (options && options.length > 0) {
                formatted += '\n' + options.join('\n');
            }
            
            return Utils.cleanText(formatted);
        }

        // ===== FALLBACK TEXT-BASED EXTRACTION =====
        static extractQuestionsFromText() {
            console.log('[LMS AI] Using fallback text-based extraction...');
            
            try {
                const text = document.body.innerText;
                const matches = text.match(this.fallbackPatterns.question);
                
                if (!matches) {
                    console.log('[LMS AI] No questions found in page text');
                    return [];
                }

                const processedQuestions = matches.map(block => this.processTextQuestionBlock(block))
                                                .filter(q => q && q.trim().length > 0);
                
                const cleanedQuestions = this.removeDuplicateHeaders(processedQuestions);
                
                return cleanedQuestions;
            } catch (error) {
                console.error('[LMS AI] Text-based extraction error:', error);
                return [];
            }
        }

        static processTextQuestionBlock(block) {
            const enhancedFilteredBlock = this.enhancedFilterTextBlock(block);
            const lines = enhancedFilteredBlock.split('\n').map(line => line.trim()).filter(Boolean);
            const options = lines.filter(line => /^[A-D]\./i.test(line));
            
            if (options.length >= 2) {
                return this.formatMCQ(enhancedFilteredBlock, options);
            }
            
            return this.formatOtherQuestion(enhancedFilteredBlock);
        }

        static enhancedFilterTextBlock(block) {
            const lines = block.split('\n');
            const processedLines = [];
            const seenQuestionHeaders = new Set();
            
            for (const line of lines) {
                const trimmed = line.trim();
                
                if (this.fallbackPatterns.pointPattern.test(trimmed)) {
                    continue;
                }
                
                const headerMatch = trimmed.match(this.fallbackPatterns.questionHeader);
                if (headerMatch) {
                    const header = headerMatch[0];
                    if (seenQuestionHeaders.has(header)) {
                        continue;
                    }
                    seenQuestionHeaders.add(header);
                }
                
                processedLines.push(line);
            }
            
            const cleanedLines = [];
            let lastWasBlank = false;
            
            for (const line of processedLines) {
                const isBlank = line.trim() === '';
                
                if (isBlank) {
                    if (!lastWasBlank) {
                        cleanedLines.push(line);
                    }
                    lastWasBlank = true;
                } else {
                    cleanedLines.push(line);
                    lastWasBlank = false;
                }
            }
            
            return cleanedLines.join('\n');
        }

        static formatMCQ(block, options) {
            const formattedOptions = options.map((opt, index) => {
                const letter = String.fromCharCode(65 + index);
                const content = opt.replace(/^[A-D]\.\s*/, '');
                return `${letter} ${content}`;
            });
            
            return block.replace(/^[A-D]\.\s*.+$/gm, (match) => {
                const index = options.indexOf(match);
                return index >= 0 ? formattedOptions[index] : match;
            });
        }

        static formatOtherQuestion(block) {
            if (this.fallbackPatterns.fillInBlank.test(block)) {
                return this.processFillInBlank(block);
            }
            
            if (this.fallbackPatterns.truefalse.test(block)) {
                return this.processTrueFalse(block);
            }
            
            return block;
        }

        static processFillInBlank(block) {
            return block.replace(/（\s*）/g, '（　）')
                       .replace(/★/g, '★')
                       .replace(/_+/g, '____');
        }

        static processTrueFalse(block) {
            return block + '\n選択肢: A 正しい, B 間違い';
        }

        static removeDuplicateHeaders(questions) {
            return questions.map(question => {
                const lines = question.split('\n');
                const cleanedLines = [];
                const seenHeaders = new Set();
                
                for (const line of lines) {
                    const trimmedLine = line.trim();
                    
                    const headerMatch = trimmedLine.match(/^Question\s+\d+$/i);
                    if (headerMatch) {
                        const header = headerMatch[0];
                        if (!seenHeaders.has(header)) {
                            seenHeaders.add(header);
                            cleanedLines.push(line);
                        }
                    } else {
                        cleanedLines.push(line);
                    }
                }
                
                return cleanedLines.join('\n');
            });
        }

        static getQuestionType(text) {
            if (this.fallbackPatterns.mcq.test(text)) return 'mcq';
            if (this.fallbackPatterns.fillInBlank.test(text)) return 'fillInBlank';
            if (this.fallbackPatterns.truefalse.test(text)) return 'truefalse';
            if (this.fallbackPatterns.matching.test(text)) return 'matching';
            if (this.fallbackPatterns.reading.test(text)) return 'reading';
            return 'other';
        }
    }
// ===== OPTIMIZED API MODULE WITH SYSTEM MESSAGES =====
    class APIManager {
        constructor() {
            this.cache = new Cache();
            this.rateLimiter = new Map();
        }

        async callAPI(provider, prompt, retries = 3) {
            const cacheKey = this.generateCacheKey(provider, prompt);
            const cached = this.cache.get(cacheKey);
            
            if (cached) {
                console.log('[LMS AI] Using cached API response');
                return cached;
            }

            for (let attempt = 1; attempt <= retries; attempt++) {
                try {
                    console.log(`[LMS AI] Calling ${provider} API (attempt ${attempt})`);
                    const result = await this.makeAPICall(provider, prompt);
                    this.cache.set(cacheKey, result);
                    return result;
                } catch (error) {
                    console.warn(`[LMS AI] API attempt ${attempt} failed:`, error);
                    
                    if (error.message.includes('401') || error.message.includes('403')) {
                        console.log('[LMS AI] Authentication error');
                        this.cache.clear();
                        throw error;
                    }
                    
                    if (attempt < retries) {
                        await Utils.sleep(1000 * attempt);
                    } else {
                        throw error;
                    }
                }
            }
        }

        async makeAPICall(provider, prompt) {
            const apiKey = this.getAPIKey();
            
            if (!apiKey) {
                throw new Error('API key not found');
            }

            const config = this.getAPIConfig(provider, prompt, apiKey);
            
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: config.url,
                    headers: config.headers,
                    data: JSON.stringify(config.data),
                    timeout: 30000,
                    onload: (response) => {
                        try {
                            if (response.status === 401 || response.status === 403) {
                                throw new Error('API authentication failed');
                            }
                            
                            if (response.status !== 200) {
                                throw new Error(`API returned status ${response.status}`);
                            }
                            
                            const data = JSON.parse(response.responseText);
                            if (data.error) {
                                throw new Error(data.error.message || 'API error');
                            }
                            
                            const result = this.extractAnswer(provider, data);
                            resolve(result);
                        } catch (error) {
                            reject(error);
                        }
                    },
                    onerror: () => reject(new Error('Network error')),
                    ontimeout: () => reject(new Error('Request timeout'))
                });
            });
        }

        getAPIConfig(provider, prompt, apiKey) {
            const configs = {
                deepseek: {
                    url: CONFIG.API_ENDPOINTS.deepseek,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    data: {
                        model: 'deepseek-chat',
                        messages: [
                            {
                                role: 'system',
                                content: CONFIG.SYSTEM_PROMPT
                            },
                            {
                                role: 'user',
                                content: prompt
                            }
                        ],
                        max_tokens: 1000,
                        temperature: 0.1
                    }
                },
                openai: {
                    url: CONFIG.API_ENDPOINTS.openai,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    data: {
                        model: 'gpt-3.5-turbo',
                        messages: [
                            {
                                role: 'system',
                                content: CONFIG.SYSTEM_PROMPT
                            },
                            {
                                role: 'user',
                                content: prompt
                            }
                        ],
                        max_tokens: 1000,
                        temperature: 0.1
                    }
                }
            };

            return configs[provider];
        }

        extractAnswer(provider, data) {
            switch (provider) {
                case 'deepseek':
                case 'openai':
                    return data.choices[0].message.content;
                default:
                    throw new Error(`Unsupported provider: ${provider}`);
            }
        }

        getAPIKey() {
            try {
                const stored = GM_getValue('api_key', '');
                if (!stored) return null;
                return Encryption.decode(stored);
            } catch (error) {
                console.error('[LMS AI] API key retrieval error:', error);
                return null;
            }
        }

        generateCacheKey(provider, prompt) {
            return `${provider}:${encodeURIComponent(prompt.substring(0, 100))}`;
        }
    }

    // ===== ENHANCED UI MANAGER WITH STEALTH MODE =====
    class UIManager {
        constructor(licenseManager) {
            this.licenseManager = licenseManager;
            this.elements = {};
            this.timers = {};
            this.state = {
                visible: false,
                emergency: false,
                loading: false,
                hardcoreMode: false,
                hideDeepSeekAnswer: false
            };
            this.lastMove = 0;
            this.apiErrorFlag = false;
            this.tokensProcessed = 0;
            this.init();
            
            // Check license once on initialization instead of repeated intervals
            this.licenseManager.checkLicense();
            this.updateSettingsButtonVisibility();
        }

        init() {
            this.createModernStyles();
            this.createElements();
            this.bindEvents();
            this.setupAccessibility();
            this.updateSettingsButtonVisibility();
        }

        createModernStyles() {
            const css = `
                :root {
                    --ai-primary: #3b82f6;
                    --ai-primary-hover: #2563eb;
                    --ai-secondary: #6366f1;
                    --ai-secondary-hover: #4f46e5;
                    --ai-success: #10b981;
                    --ai-success-hover: #059669;
                    --ai-warning: #f59e0b;
                    --ai-warning-hover: #d97706;
                    --ai-error: #ef4444;
                    --ai-error-hover: #dc2626;
                    --ai-surface: rgba(255, 255, 255, 0.98);
                    --ai-surface-dark: rgba(31, 41, 55, 0.98);
                    --ai-text: #1f2937;
                    --ai-text-light: #6b7280;
                    --ai-text-dark: #f9fafb;
                    --ai-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                    --ai-shadow-lg: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                    --ai-border: rgba(229, 231, 235, 0.8);
                    --ai-gradient: linear-gradient(135deg, var(--ai-primary), var(--ai-secondary));
                }

                #lms-ai-container {
                    position: fixed;
                    right: 20px;
                    bottom: 20px;
                    z-index: 99999;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    opacity: 0;
                    transform: translateY(30px);
                    transition: all 0.4s ${CONFIG.UI.ANIMATION_EASING};
                    pointer-events: none;
                }

                #lms-ai-container.visible {
                    opacity: 1;
                    transform: translateY(0);
                    pointer-events: auto;
                }

                #lms-ai-container.emergency {
                    display: none !important;
                }

                .ai-button {
                    padding: 16px 20px;
                    border: none;
                    border-radius: 16px;
                    font-size: 18px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ${CONFIG.UI.ANIMATION_EASING};
                    box-shadow: var(--ai-shadow);
                    position: relative;
                    overflow: hidden;
                    min-width: 64px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    backdrop-filter: blur(10px);
                    border: 1px solid var(--ai-border);
                }

                .ai-button:hover {
                    transform: translateY(-4px);
                    box-shadow: var(--ai-shadow-lg);
                }

                .ai-button:active {
                    transform: translateY(-2px);
                }

                .ai-button:disabled {
                    opacity: 0.7;
                    cursor: not-allowed;
                    transform: none !important;
                }

                .ai-button.loading::after {
                    content: '';
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: 22px;
                    height: 22px;
                    margin: -11px 0 0 -11px;
                    border: 3px solid transparent;
                    border-top: 3px solid currentColor;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                .ai-button-primary {
                    background: var(--ai-gradient);
                    color: white;
                }

                .ai-button-primary:hover {
                    background: linear-gradient(135deg, var(--ai-primary-hover), var(--ai-secondary-hover));
                }

                .ai-button-secondary {
                    background: linear-gradient(135deg, #6b7280, #4b5563);
                    color: white;
                }

                .ai-button-secondary:hover {
                    background: linear-gradient(135deg, #4b5563, #374151);
                }

                .ai-button-success {
                    background: linear-gradient(135deg, var(--ai-success), #059669);
                    color: white;
                }

                .ai-button-success:hover {
                    background: linear-gradient(135deg, var(--ai-success-hover), #047857);
                }

                #ai-stealth-output {
                    position: fixed;
                    bottom: 40px;
                    left: 50%;
                    transform: translateX(-50%);
                    max-width: 450px;
                    min-width: 320px;
                    max-height: 250px;
                    overflow-y: auto;
                    background: var(--ai-surface);
                    color: var(--ai-text);
                    font-size: 12px;
                    line-height: 1.5;
                    padding: 16px;
                    border-radius: 16px;
                    box-shadow: var(--ai-shadow-lg);
                    opacity: 0;
                    transform: translateX(-50%) translateY(30px);
                    transition: all 0.4s ${CONFIG.UI.ANIMATION_EASING};
                    z-index: 99998;
                    backdrop-filter: blur(20px);
                    border: 2px solid white;
                    white-space: pre-wrap;
                }

                #ai-stealth-output.visible {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }

                #ai-stealth-output.emergency {
                    display: none !important;
                }

                .ai-tooltip {
                    position: absolute;
                    bottom: 110%;
                    left: 50%;
                    transform: translateX(-50%);
                    background: var(--ai-surface-dark);
                    color: var(--ai-text-dark);
                    padding: 10px 14px;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 500;
                    white-space: nowrap;
                    opacity: 0;
                    transition: all 0.3s ${CONFIG.UI.ANIMATION_EASING};
                    pointer-events: none;
                    margin-bottom: 8px;
                    box-shadow: var(--ai-shadow);
                }

                .ai-button:hover .ai-tooltip {
                    opacity: 1;
                    transform: translateX(-50%) translateY(-4px);
                }

                .ai-settings-panel {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: var(--ai-surface);
                    color: var(--ai-text);
                    padding: 32px;
                    border-radius: 20px;
                    box-shadow: var(--ai-shadow-lg);
                    z-index: 100000;
                    min-width: 480px;
                    max-width: 90vw;
                    opacity: 0;
                    transform: translate(-50%, -50%) scale(0.9);
                    transition: all 0.4s ${CONFIG.UI.ANIMATION_EASING};
                    pointer-events: none;
                    border: 1px solid var(--ai-border);
                    backdrop-filter: blur(20px);
                }

                .ai-settings-panel.visible {
                    opacity: 1;
                    transform: translate(-50%, -50%) scale(1);
                    pointer-events: auto;
                }

                .ai-settings-panel h2 {
                    margin: 0 0 24px 0;
                    font-size: 24px;
                    font-weight: 700;
                    color: var(--ai-text);
                    text-align: center;
                }

                .settings-group {
                    margin-bottom: 20px;
                }

                .settings-group label {
                    display: block;
                    margin-bottom: 8px;
                    font-weight: 600;
                    color: var(--ai-text);
                }

                .settings-group input,
                .settings-group select {
                    width: 100%;
                    padding: 12px 16px;
                    border: 2px solid var(--ai-border);
                    border-radius: 12px;
                    font-size: 14px;
                    transition: all 0.3s ${CONFIG.UI.ANIMATION_EASING};
                    background: rgba(255, 255, 255, 0.8);
                    backdrop-filter: blur(10px);
                    box-sizing: border-box;
                }

                .settings-group input:focus,
                .settings-group select:focus {
                    outline: none;
                    border-color: var(--ai-primary);
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                }

                .settings-actions {
                    display: flex;
                    gap: 16px;
                    justify-content: space-between;
                    margin-top: 32px;
                }

                .settings-actions button {
                    flex: 1;
                    padding: 12px 20px;
                    border: none;
                    border-radius: 12px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ${CONFIG.UI.ANIMATION_EASING};
                }

                #save-all-settings {
                    background: var(--ai-gradient);
                    color: white;
                }

                #save-all-settings:hover {
                    background: linear-gradient(135deg, var(--ai-primary-hover), var(--ai-secondary-hover));
                    transform: translateY(-2px);
                }

                #close-settings {
                    background: #f3f4f6;
                    color: var(--ai-text);
                }

                #close-settings:hover {
                    background: #e5e7eb;
                    transform: translateY(-2px);
                }

                #clear-cache {
                    background: var(--ai-warning);
                    color: white;
                }

                #clear-cache:hover {
                    background: var(--ai-warning-hover);
                    transform: translateY(-2px);
                }

                .ai-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.6);
                    z-index: 99999;
                    opacity: 0;
                    transition: opacity 0.4s ${CONFIG.UI.ANIMATION_EASING};
                    pointer-events: none;
                    backdrop-filter: blur(4px);
                }

                .ai-overlay.visible {
                    opacity: 1;
                    pointer-events: auto;
                }

                .ai-toast {
                    position: fixed;
                    top: 24px;
                    right: 24px;
                    padding: 16px 20px;
                    border-radius: 12px;
                    color: white;
                    font-size: 14px;
                    font-weight: 500;
                    z-index: 100001;
                    transform: translateX(120%);
                    transition: all 0.4s ${CONFIG.UI.ANIMATION_EASING};
                    max-width: 400px;
                    min-width: 280px;
                    box-shadow: var(--ai-shadow);
                    backdrop-filter: blur(10px);
                }

                .ai-toast.visible {
                    transform: translateX(0);
                }

                .toast-content {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .toast-message {
                    flex: 1;
                }

                .ai-toast-success {
                    background: var(--ai-success);
                }

                .ai-toast-error {
                    background: var(--ai-error);
                }

                .ai-toast-warning {
                    background: var(--ai-warning);
                }

                .ai-toast-info {
                    background: var(--ai-primary);
                }

                @media (max-width: 768px) {
                    #lms-ai-container {
                        right: 16px;
                        bottom: 16px;
                        opacity: 1;
                        transform: translateY(0);
                        pointer-events: auto;
                    }

                    .ai-button {
                        padding: 14px 18px;
                        font-size: 16px;
                    }

                    #ai-stealth-output {
                        left: 16px;
                        right: 16px;
                        max-width: none;
                        min-width: auto;
                        transform: translateY(30px);
                    }

                    #ai-stealth-output.visible {
                        transform: translateY(0);
                    }

                    .ai-settings-panel {
                        min-width: 90vw;
                        padding: 24px;
                        margin: 20px;
                    }

                    .ai-toast {
                        top: 16px;
                        right: 16px;
                        left: 16px;
                        max-width: none;
                    }
                }

                .ai-progress-bar {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    height: 4px;
                    background: rgba(255, 255, 255, 0.9);
                    transition: width 0.3s ${CONFIG.UI.ANIMATION_EASING};
                    border-radius: 0 0 16px 16px;
                }
            `;

            GM_addStyle(css);
        }
createElements() {
            // Main container
            this.elements.container = this.createElement('div', {
                id: 'lms-ai-container',
                role: 'toolbar',
                'aria-label': 'LMS AI Assistant'
            });

            // Updated buttons with new shortcuts
            this.elements.gptButton = this.createButton('🧠', 'ai-button ai-button-primary', 'Open ChatGPT', 'Shift+`');
            this.elements.deepseekButton = this.createButton('⚡', 'ai-button ai-button-secondary', 'Use DeepSeek API', '`');
            this.elements.settingsButton = this.createButton('⚙️', 'ai-button ai-button-success', 'Settings', 'Ctrl+,');

            // Stealth output
            this.elements.stealthOutput = this.createElement('div', {
                id: 'ai-stealth-output',
                role: 'status',
                'aria-live': 'polite'
            });

            // Settings panel with unified save button
            this.elements.settingsPanel = this.createUnifiedSettingsPanel();
            this.elements.overlay = this.createElement('div', { class: 'ai-overlay' });

            // Append elements
            this.elements.container.append(
                this.elements.gptButton,
                this.elements.deepseekButton,
                this.elements.settingsButton
            );

            document.body.append(
                this.elements.container,
                this.elements.stealthOutput,
                this.elements.overlay,
                this.elements.settingsPanel
            );
        }

        createButton(text, className, tooltip, shortcut) {
            const button = this.createElement('button', {
                class: className,
                'aria-label': tooltip,
                type: 'button'
            });

            button.innerHTML = `
                ${text}
                <span class="ai-tooltip">${tooltip} (${shortcut})</span>
                <div class="ai-progress-bar" style="width: 0%"></div>
            `;

            return button;
        }

        createUnifiedSettingsPanel() {
            const panel = this.createElement('div', {
                class: 'ai-settings-panel',
                role: 'dialog',
                'aria-labelledby': 'settings-title'
            });

            panel.innerHTML = `
                <h2 id="settings-title">Configuration Panel</h2>
                
                <div class="settings-group">
                    <label for="api-key-input">API Key:</label>
                    <input type="password" id="api-key-input" placeholder="Enter your DeepSeek API key">
                </div>
                
                <div class="settings-group">
                    <label for="product-key-input">Product Key:</label>
                    <input type="text" id="product-key-input" placeholder="Enter your subscription key">
                </div>
                
                <div class="settings-group">
                    <label for="provider-select">AI Provider:</label>
                    <select id="provider-select">
                        <option value="deepseek">DeepSeek (Recommended)</option>
                        <option value="openai">OpenAI GPT</option>
                    </select>
                </div>
                
                <div class="settings-actions">
                    <button id="save-all-settings">Save All Settings</button>
                    <button id="clear-cache">Clear Cache</button>
                    <button id="close-settings">Close</button>
                </div>
            `;

            return panel;
        }

        createElement(tag, attributes = {}) {
            const element = document.createElement(tag);
            Object.entries(attributes).forEach(([key, value]) => {
                element.setAttribute(key, value);
            });
            return element;
        }

        bindEvents() {
            // Button events
            this.elements.gptButton.addEventListener('click', () => this.handleGPT());
            this.elements.deepseekButton.addEventListener('click', () => this.handleDeepSeek());
            this.elements.settingsButton.addEventListener('click', () => this.showSettings());

            // Keyboard shortcuts - UPDATED
            document.addEventListener('keydown', (e) => this.handleKeyboard(e));

            // Mouse events
            if (!Utils.isMobile()) {
                const throttledMouseMove = Utils.throttle((e) => this.handleMouseMove(e), CONFIG.UI.THROTTLE_DELAY);
                document.addEventListener('mousemove', throttledMouseMove);
                this.elements.container.addEventListener('mouseenter', () => this.showButtons());
                this.elements.container.addEventListener('mouseleave', () => this.hideButtonsLater());
            } else {
                this.showButtons();
            }

            // Unified settings panel events
            this.elements.overlay.addEventListener('click', () => this.hideSettings());
            this.elements.settingsPanel.querySelector('#close-settings').addEventListener('click', () => this.hideSettings());
            this.elements.settingsPanel.querySelector('#save-all-settings').addEventListener('click', () => this.saveAllSettings());
            this.elements.settingsPanel.querySelector('#clear-cache').addEventListener('click', () => this.clearCache());
        }

        setupAccessibility() {
            this.elements.container.addEventListener('keydown', (e) => {
                if (e.key === 'Tab') this.showButtons();
            });
            this.elements.container.addEventListener('focusin', () => this.showButtons());
            this.elements.container.addEventListener('focusout', () => this.hideButtonsLater());
        }

        handleKeyboard(e) {
            if (this.state.emergency) {
                if (e.ctrlKey && e.shiftKey && e.code === 'KeyE') this.toggleEmergencyMode();
                return;
            }

            // Emergency mode
            if (e.ctrlKey && e.shiftKey && e.code === 'KeyE') {
                e.preventDefault();
                this.toggleEmergencyMode();
                return;
            }
            
            // Hardcore mode
            if (e.ctrlKey && e.code === 'KeyH') {
                e.preventDefault();
                this.toggleHardcoreMode();
                return;
            }
            
            // UPDATED: Toggle DeepSeek answer visibility (Ctrl + `)
            if (e.ctrlKey && e.code === 'Backquote') {
                e.preventDefault();
                this.state.hideDeepSeekAnswer = !this.state.hideDeepSeekAnswer;
                const message = this.state.hideDeepSeekAnswer ? 
                    'DeepSeek answers hidden' : 'DeepSeek answers visible';
                this.showStealth(message, 1500);
                if (this.state.hideDeepSeekAnswer) this.hideStealth();
                return;
            }

            // UPDATED: ChatGPT (Shift + `)
            if (e.shiftKey && e.code === 'Backquote') {
                e.preventDefault();
                this.handleGPT();
                return;
            }

            // DeepSeek API (`)
            if (e.code === 'Backquote' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                e.preventDefault();
                this.handleDeepSeek();
                return;
            }

            // Settings
            if (e.ctrlKey && e.code === 'Comma') {
                e.preventDefault();
                this.showSettings();
                return;
            }
            
            // Help
            if (e.code === 'F1') {
                e.preventDefault();
                this.showHelp();
                return;
            }
        }
        
        showHelp() {
            const licenseStatus = this.licenseManager.isValid() ? 
                'REGISTERED' : 'NOT REGISTERED';
            
            const helpText = `
LMS AI Assistant v${CONFIG.VERSION}

Keyboard Shortcuts:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Shift + \` → Open ChatGPT
\`        → Use DeepSeek API
Ctrl + \`  → Toggle answer visibility
Ctrl + , → Open Settings
Ctrl+Shift+E → Emergency Mode
Ctrl+H   → Hardcore Mode
F1       → Show Help

Status:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
License: ${licenseStatus}
Tokens Processed: ${this.tokensProcessed.toLocaleString()}

Features:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• DOM-based question extraction
• System message optimization
• Multiple AI providers
• Response caching
• Token tracking
• Stealth mode
• Mobile support
            `.trim();
            
            this.showStealth(helpText);
        }

        handleMouseMove(e) {
            if (this.state.emergency || this.state.hardcoreMode) return;

            const rect = this.elements.container.getBoundingClientRect();
            const distance = Math.sqrt(
                Math.pow(e.clientX - rect.right, 2) + 
                Math.pow(e.clientY - rect.bottom, 2)
            );

            if (distance < 150) this.showButtons();
        }

        showButtons() {
            if (this.state.emergency || this.state.hardcoreMode) return;
            this.elements.container.classList.add('visible');
            this.state.visible = true;
            clearTimeout(this.timers.hideButtons);
            this.timers.hideButtons = setTimeout(() => this.hideButtons(), CONFIG.UI.HIDE_DELAY);
        }

        hideButtons() {
            if (this.state.emergency || this.state.hardcoreMode) return;
            this.elements.container.classList.remove('visible');
            this.state.visible = false;
        }

        hideButtonsLater() {
            clearTimeout(this.timers.hideButtons);
            this.timers.hideButtons = setTimeout(() => this.hideButtons(), 2000);
        }

        // UPDATED: Use stealth output for all messages
        showStealth(message, duration = null) {
            if (this.state.emergency) return;
            this.elements.stealthOutput.textContent = Utils.sanitizeHtml(message);
            this.elements.stealthOutput.classList.add('visible');
            
            const baseTime = duration !== null ? duration : 3000;
            const charTime = 80;
            const maxTime = 15000;
            const displayTime = Math.min(baseTime + (message.length * charTime), maxTime);
            
            clearTimeout(this.timers.hideStealth);
            this.timers.hideStealth = setTimeout(() => this.hideStealth(), displayTime);
        }

        hideStealth() {
            this.elements.stealthOutput.classList.remove('visible');
        }

        showSettings() {
            if (this.state.emergency) return;
            this.elements.overlay.classList.add('visible');
            this.elements.settingsPanel.classList.add('visible');
            
            // Load current settings
            const apiKey = GM_getValue('api_key') ? '••••••••••••••••' : '';
            const provider = GM_getValue('default_provider', 'deepseek');
            const productKey = GM_getValue('product_key', '');
            
            this.elements.settingsPanel.querySelector('#api-key-input').value = apiKey;
            this.elements.settingsPanel.querySelector('#product-key-input').value = productKey;
            this.elements.settingsPanel.querySelector('#provider-select').value = provider;
        }

        hideSettings() {
            this.elements.overlay.classList.remove('visible');
            this.elements.settingsPanel.classList.remove('visible');
        }

        // UNIFIED SAVE FUNCTION
        saveAllSettings() {
            const apiKeyInput = this.elements.settingsPanel.querySelector('#api-key-input');
            const productKeyInput = this.elements.settingsPanel.querySelector('#product-key-input');
            const providerSelect = this.elements.settingsPanel.querySelector('#provider-select');
            
            let savedItems = [];
            let hasErrors = false;
            
            // Save API Key
            const apiKey = apiKeyInput.value.trim();
            if (apiKey && apiKey !== '••••••••••••••••') {
                try {
                    const encrypted = Encryption.encode(apiKey);
                    GM_setValue('api_key', encrypted);
                    savedItems.push('API Key');
                } catch (error) {
                    console.error('[LMS AI] API key save error:', error);
                    Utils.showToast('Failed to save API key', 'error');
                    hasErrors = true;
                }
            }
            
            // Save Product Key
            const productKey = productKeyInput.value.trim();
            if (productKey) {
                try {
                    if (CONFIG.LICENSE.KEY_PATTERN.test(productKey)) {
                        GM_setValue('product_key', productKey);
                        this.licenseManager.resetRegisteredMessage();
                        savedItems.push('Product Key');
                    } else {
                        Utils.showToast('Invalid product key format', 'error');
                        hasErrors = true;
                    }
                } catch (error) {
                    console.error('[LMS AI] Product key save error:', error);
                    Utils.showToast('Failed to save product key', 'error');
                    hasErrors = true;
                }
            }
            
            // Save Provider
            const provider = providerSelect.value;
            GM_setValue('default_provider', provider);
            savedItems.push('Provider');
            
            // Update license and UI
            this.licenseManager.checkLicense();
            this.apiErrorFlag = false;
            this.updateSettingsButtonVisibility();
            
            // Show success message
            if (!hasErrors && savedItems.length > 0) {
                const message = `Settings saved: ${savedItems.join(', ')}`;
                Utils.showToast(message, 'success');
                this.hideSettings();
            }
        }

        clearCache() {
            if (window.lmsAI?.apiManager) {
                window.lmsAI.apiManager.cache.clear();
                Utils.showToast('Cache cleared successfully', 'success');
            }
        }

        setButtonLoading(button, loading) {
            if (loading) {
                button.classList.add('loading');
                button.disabled = true;
            } else {
                button.classList.remove('loading');
                button.disabled = false;
            }
        }

        updateProgress(button, progress) {
            const progressBar = button.querySelector('.ai-progress-bar');
            if (progressBar) progressBar.style.width = `${progress}%`;
        }

        // UPDATED: Emergency mode with stealth messages
        toggleEmergencyMode() {
            this.state.emergency = !this.state.emergency;
            if (this.state.emergency) {
                this.elements.container.classList.add('emergency');
                this.elements.stealthOutput.classList.add('emergency');
                this.hideSettings();
                this.showStealth('Emergency mode activated', 1500);
            } else {
                this.elements.container.classList.remove('emergency');
                this.elements.stealthOutput.classList.remove('emergency');
                this.showStealth('Emergency mode deactivated', 1500);
            }
        }
        
        // UPDATED: Hardcore mode with stealth messages
        toggleHardcoreMode() {
            this.state.hardcoreMode = !this.state.hardcoreMode;
            
            if (this.state.hardcoreMode) {
                this.showStealth('Hardcore mode activated', 1500);
            } else {
                this.showStealth('Hardcore mode deactivated', 1500);
            }
        }
        
        updateSettingsButtonVisibility() {
            const hasAPIKey = !!window.lmsAI?.apiManager?.getAPIKey();
            const shouldShow = !this.licenseManager.isValid() || 
                             !hasAPIKey || 
                             this.apiErrorFlag;
            
            if (this.elements.settingsButton) {
                this.elements.settingsButton.style.display = shouldShow ? 'flex' : 'none';
            }
        }
async handleGPT() {
            if (this.state.emergency) {
                this.showStealth('Emergency mode active. Press Ctrl+Shift+E to disable.', 2000);
                return;
            }
            
            if (!this.licenseManager.isValid()) {
                this.showStealth('Invalid license. Please enter a product key in settings.', 2000);
                return;
            }

            if (this.state.loading) return;

            try {
                this.state.loading = true;
                this.setButtonLoading(this.elements.gptButton, true);
                
                const questions = QuestionParser.extractQuestions();
                if (!questions.length) {
                    this.showStealth('No questions found on this page', 2000);
                    return;
                }

                const uniqueQuestions = [...new Set(questions)];
                const prompt = this.buildPrompt(uniqueQuestions);
                
                // Track tokens
                const tokenCount = Utils.estimateTokens(prompt);
                this.tokensProcessed += tokenCount;
                window.lmsAI.analytics.recordTokenProcessing(tokenCount);
                
                await this.copyToClipboard(prompt);
                
                this.showStealth('Prompt copied to clipboard successfully', 2000);
                window.open('https://chat.openai.com', '_blank');
                
            } catch (error) {
                console.error('[LMS AI] GPT handler error:', error);
                this.showStealth('Error processing questions', 2000);
                Utils.showToast('Error processing questions', 'error');
            } finally {
                this.state.loading = false;
                this.setButtonLoading(this.elements.gptButton, false);
            }
        }

        async handleDeepSeek() {
            if (this.state.emergency) {
                this.showStealth('Emergency mode active. Press Ctrl+Shift+E to disable.', 2000);
                return;
            }
            
            if (!this.licenseManager.isValid()) {
                this.showStealth('Invalid license. Please enter a product key in settings.', 2000);
                return;
            }

            if (this.state.loading) return;

            try {
                this.state.loading = true;
                this.setButtonLoading(this.elements.deepseekButton, true);
                
                const questions = QuestionParser.extractQuestions();
                if (!questions.length) {
                    this.showStealth('No questions found on this page', 2000);
                    return;
                }

                const uniqueQuestions = [...new Set(questions)];
                const prompt = this.buildUserPrompt(uniqueQuestions);
                
                // Track tokens (system + user message)
                const systemTokens = Utils.estimateTokens(CONFIG.SYSTEM_PROMPT);
                const userTokens = Utils.estimateTokens(prompt);
                const totalTokens = systemTokens + userTokens;
                this.tokensProcessed += totalTokens;
                window.lmsAI.analytics.recordTokenProcessing(totalTokens);
                
                this.showStealth('Thinking...', 1000);
                
                const apiManager = window.lmsAI.apiManager;
                const provider = GM_getValue('default_provider', 'deepseek');
                
                this.updateProgress(this.elements.deepseekButton, 50);
                const answer = await apiManager.callAPI(provider, prompt);
                this.updateProgress(this.elements.deepseekButton, 100);
                
                window.lmsAI.analytics.recordAPICall(true);
                
                // Clear API error flag on success
                this.apiErrorFlag = false;
                this.updateSettingsButtonVisibility();
                
                if (this.state.hideDeepSeekAnswer) {
                    this.showStealth('Answers are currently hidden. Press Ctrl+` to show.', 2000);
                } else {
                    // UPDATED: Show only the answer without "DeepSeek Response:" prefix
                    this.showStealth(answer, 3000);
                }
                
            } catch (error) {
                console.error('[LMS AI] DeepSeek handler error:', error);
                window.lmsAI.analytics.recordAPICall(false);
                
                // Set API error flag and reset registered message for auth failures
                if (error.message.includes('401') || error.message.includes('403') || error.message.includes('API key')) {
                    this.apiErrorFlag = true;
                    this.licenseManager.resetRegisteredMessage();
                    this.updateSettingsButtonVisibility();
                }
                
                if (error.message.includes('API key')) {
                    this.showStealth('Please set your API key in settings', 2000);
                    Utils.showToast('API key not configured', 'error');
                } else {
                    this.showStealth('API request failed. Please try again.', 2000);
                    Utils.showToast('API request failed', 'error');
                }
            } finally {
                this.state.loading = false;
                this.setButtonLoading(this.elements.deepseekButton, false);
                this.updateProgress(this.elements.deepseekButton, 0);
            }
        }

        buildPrompt(questions) {
            return CONFIG.USER_PROMPT_HEADER + '\n\n' + questions.join('\n\n');
        }

        buildUserPrompt(questions) {
            // For system message approach, just send questions
            return questions.join('\n\n');
        }

        async copyToClipboard(text) {
            try {
                GM_setClipboard(text);
                return true;
            } catch (error) {
                console.error('[LMS AI] Clipboard error:', error);
                return false;
            }
        }
    }

    // ===== ENHANCED ANALYTICS MODULE =====
    class Analytics {
        constructor() {
            this.stats = {
                tokensProcessed: 0,
                apiCalls: 0
            };
            this.loadStats();
        }

        loadStats() {
            const stored = GM_getValue('analytics', '{}');
            try {
                this.stats = { ...this.stats, ...JSON.parse(stored) };
            } catch (error) {
                console.error('[LMS AI] Analytics load error:', error);
            }
        }

        saveStats() {
            try {
                GM_setValue('analytics', JSON.stringify(this.stats));
            } catch (error) {
                console.error('[LMS AI] Analytics save error:', error);
            }
        }

        recordTokenProcessing(tokenCount) {
            this.stats.tokensProcessed += tokenCount;
            this.saveStats();
            console.log('[LMS AI] Recorded', tokenCount, 'tokens processed, total:', this.stats.tokensProcessed);
        }

        recordAPICall() {
            this.stats.apiCalls++;
            this.saveStats();
            console.log('[LMS AI] Recorded API call, total:', this.stats.apiCalls);
        }

        getStats() {
            return { ...this.stats };
        }
    }

    // ===== MAIN APPLICATION =====
    class LMSAIAssistant {
        constructor() {
            this.version = CONFIG.VERSION;
            this.licenseManager = new LicenseManager();
            this.apiManager = new APIManager();
            this.analytics = new Analytics();
            this.uiManager = new UIManager(this.licenseManager);
            this.init();
        }

        init() {
            console.log(`[LMS AI] Updated Assistant loaded v${this.version}`);
            this.registerMenuCommands();
            this.setupErrorHandling();
            window.lmsAI = this;
        }

        registerMenuCommands() {
            GM_registerMenuCommand('Subscription Panel', () => {
                this.uiManager.showSettings();
                setTimeout(() => {
                    document.getElementById('product-key-input').focus();
                }, 300);
            });

            GM_registerMenuCommand('Statistics', () => {
                const stats = this.analytics.getStats();
                const licenseStatus = this.licenseManager.isValid() ? 
                    'REGISTERED' : 'NOT REGISTERED';
                    
                const message = `
Statistics Dashboard
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total tokens processed: ${stats.tokensProcessed.toLocaleString()}
API calls made: ${stats.apiCalls}
License status: ${licenseStatus}

Performance Overview:
• Average tokens per session: ${Math.round(stats.tokensProcessed / Math.max(stats.apiCalls, 1))}
• System efficiency: ${stats.apiCalls > 0 ? 'Optimal' : 'Standby'}
                `.trim();
                
                this.uiManager.showStealth(message);
            });

            GM_registerMenuCommand('Clear All Data', () => {
                if (confirm('Are you sure you want to clear all data? This action cannot be undone.')) {
                    GM_setValue('api_key', '');
                    GM_setValue('analytics', '{}');
                    GM_setValue('default_provider', 'deepseek');
                    GM_setValue('product_key', '');
                    GM_setValue('registered_message_shown', false);
                    this.apiManager.cache.clear();
                    this.licenseManager.checkLicense();
                    this.uiManager.apiErrorFlag = false;
                    this.uiManager.tokensProcessed = 0;
                    this.uiManager.updateSettingsButtonVisibility();
                    Utils.showToast('All data cleared successfully', 'success');
                }
            });

            GM_registerMenuCommand('Help', () => this.uiManager.showHelp());
        }

        setupErrorHandling() {
            window.addEventListener('error', (event) => {
                console.error('[LMS AI] Global error:', event.error);
                Utils.showToast(`Script error: ${event.message}`, 'error');
            });

            window.addEventListener('unhandledrejection', (event) => {
                console.error('[LMS AI] Unhandled promise rejection:', event.reason);
                Utils.showToast(`Unhandled error: ${event.reason}`, 'error');
            });
        }
    }

    // ===== INITIALIZATION =====
    function initializeWhenReady() {
        const initApp = () => {
            if (document.body) {
                try {
                    new LMSAIAssistant();
                } catch (e) {
                    console.error('[LMS AI] Initialization failed:', e);
                    Utils.showToast('Failed to initialize assistant', 'error');
                }
            } else {
                setTimeout(initApp, 100);
            }
        };
        
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            initApp();
        } else {
            document.addEventListener('DOMContentLoaded', initApp);
            window.addEventListener('load', initApp);
        }
    }

    // Start the updated application
    initializeWhenReady();

})();