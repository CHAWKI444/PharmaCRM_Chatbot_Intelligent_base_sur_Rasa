import { createElement, useEffect, useRef, useState } from 'react';
import MessageBubble from './MessageBubble';
import PageHeader from './PageHeader';
import { sendMessageToRasa } from '../services/rasaApi';
import { Activity, Calendar, Mic, MicOff, Pill, Send, Sparkles, Volume2, VolumeX } from 'lucide-react';

const SPEECH_ERRORS = {
  'not-allowed': 'Le micro est bloqué. Autorisez-le dans le navigateur pour dicter.',
  'service-not-allowed': 'La dictée vocale n’est pas autorisée dans ce navigateur.',
  'audio-capture': 'Aucun microphone n’a été détecté.',
  network: 'La dictée ne joint pas le service de reconnaissance. Vérifiez la connexion.',
  'no-speech': 'Aucune voix détectée. Réessayez en parlant plus près du micro.',
};

const frenchVoice = () => {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  return voices.find((voice) => voice.lang?.toLowerCase().startsWith('fr')) || null;
};

const spokenUtterances = [];

const speakFrench = (text) => {
  if (!text || !window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'fr-FR';
  const voice = frenchVoice();
  if (voice) utterance.voice = voice;
  spokenUtterances.push(utterance);
  if (spokenUtterances.length > 8) spokenUtterances.shift();
  window.speechSynthesis.speak(utterance);
};

const SUGGESTIONS = [
  { icon: Pill, title: 'Doliprane', text: 'Quels sont les effets secondaires du Doliprane ?', color: 'var(--accent-light)' },
  { icon: Calendar, title: 'Planifier une visite', text: 'Je veux voir un médecin le 20 juillet', color: 'var(--accent-light)' },
  { icon: Activity, title: 'Prix public', text: 'Donne-moi le prix du Glucophage en Tunisie', color: 'var(--warning)' },
];

const ChatWindow = ({ messages, setMessages, isSidebarOpen, setIsSidebarOpen }) => {
  const [inputVal, setInputVal] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTtsEnabled, setIsTtsEnabled] = useState(() => localStorage.getItem('crm_tts') === 'on');
  const [errorToast, setErrorToast] = useState(null);
  const recognitionRef = useRef(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const toastTimerRef = useRef(null);

  const showVoiceError = (message) => {
    setErrorToast(message);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setErrorToast(null), 5000);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    localStorage.setItem('crm_tts', isTtsEnabled ? 'on' : 'off');
  }, [isTtsEnabled]);

  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return undefined;
    const warmVoices = () => synth.getVoices();
    warmVoices();
    synth.addEventListener('voiceschanged', warmVoices);
    return () => {
      synth.removeEventListener('voiceschanged', warmVoices);
      window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const handleSend = async (event) => {
    event?.preventDefault();
    const userText = inputVal.trim();
    if (!userText || isTyping) return;

    setMessages((prev) => [...prev, { id: Date.now().toString(), text: userText, sender: 'user', time: new Date() }]);
    setInputVal('');
    setIsTyping(true);
    setErrorToast(null);
    if (inputRef.current) inputRef.current.style.height = '24px';

    try {
      const responses = await sendMessageToRasa(userText, 'user_session_1');
      const botMessages = (responses || []).filter((item) => item?.text).map((item, index) => ({
        id: `bot_${Date.now()}_${index}`,
        text: item.text,
        source: item.source,
        sender: 'bot',
        isError: item.source === 'error',
        time: new Date(),
      }));

      setMessages((prev) => [...prev, ...(botMessages.length ? botMessages : [{
        id: `bot_${Date.now()}`,
        text: 'Je n’ai pas de réponse à cette question pour le moment.',
        sender: 'bot',
        time: new Date(),
      }])]);

      if (isTtsEnabled) {
        botMessages.forEach((item) => speakFrench(item.text));
      }
    } catch (err) {
      showVoiceError(err.message);
      setMessages((prev) => [...prev, {
        id: `err_${Date.now()}`,
        text: 'La communication avec le serveur a échoué.',
        sender: 'bot',
        source: 'error',
        isError: true,
        time: new Date(),
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleInput = (event) => {
    setInputVal(event.target.value);
    event.target.style.height = '24px';
    event.target.style.height = `${Math.min(event.target.scrollHeight, 140)}px`;
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showVoiceError('La dictée vocale n’est pas disponible dans ce navigateur.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (!transcript) return;
      setInputVal((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onerror = (event) => {
      setIsListening(false);
      if (!event.error || event.error === 'aborted') return;
      showVoiceError(SPEECH_ERRORS[event.error] || 'La dictée vocale s’est interrompue.');
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setIsListening(false);
      showVoiceError('La dictée vocale n’a pas pu démarrer.');
    }
  };

  const toggleTts = () => {
    setIsTtsEnabled((prev) => {
      if (prev) window.speechSynthesis?.cancel();
      return !prev;
    });
  };

  return (
    <>
      <PageHeader
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        title="Assistant CRM"
        subtitle={<><span className="status-dot" /> Prêt pour les questions médicaments et les visites</>}
      >
        <button type="button" className={`icon-btn${isTtsEnabled ? ' active' : ''}`} onClick={toggleTts} aria-label={isTtsEnabled ? 'Désactiver la lecture vocale' : 'Activer la lecture vocale'} aria-pressed={isTtsEnabled}>
          {isTtsEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        <span className="header-badge">Terrain</span>
      </PageHeader>

      <div className="chat-window">
        {messages.length === 0 ? (
          <div className="welcome-screen">
            <div className="welcome-mark"><Sparkles size={24} /></div>
            <h2 className="welcome-title">Comment puis-je vous aider ?</h2>
            <p className="welcome-subtitle">
              Interrogez le référentiel médicament ou décrivez une visite pour l’enregistrer.
            </p>
            <div className="suggestion-grid">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion.title} type="button" className="suggestion-card" onClick={() => { setInputVal(suggestion.text); inputRef.current?.focus(); }}>
                  {createElement(suggestion.icon, { size: 18, color: suggestion.color })}
                  <strong>{suggestion.title}</strong>
                  <span>{suggestion.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}

        {isTyping && (
          <div className="message-row bot">
            <div className="avatar bot" aria-hidden="true"><Sparkles size={16} /></div>
            <div className="bubble-wrapper">
              <div className="bubble bot" aria-label="Réponse en cours">
                <div className="typing-indicator">
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {errorToast ? <div className="error-toast" role="alert">{errorToast}</div> : null}

      <div className="input-area">
        <form className="input-wrapper" onSubmit={handleSend}>
          <textarea
            ref={inputRef}
            className="chat-input"
            placeholder="Posez une question ou décrivez une visite"
            value={inputVal}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={isTyping}
            aria-label="Message"
          />
          <button type="button" className={`icon-btn${isListening ? ' active' : ''}`} onClick={toggleListening} aria-label={isListening ? 'Arrêter la dictée' : 'Dicter un message'} aria-pressed={isListening}>
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button type="submit" className="send-btn" disabled={!inputVal.trim() || isTyping} aria-label="Envoyer">
            <Send size={16} />
          </button>
        </form>
        <p className="input-hint">Vérifiez les informations médicales et commerciales avant de les utiliser.</p>
      </div>
    </>
  );
};

export default ChatWindow;
