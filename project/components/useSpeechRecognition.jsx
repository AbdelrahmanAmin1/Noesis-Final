// Browser speech-to-text hook for the Free Chat composer.
const useSpeechRecognition = ({ onResult, onError, lang = 'en-US' } = {}) => {
  const [listening, setListening] = React.useState(false);
  const [supported, setSupported] = React.useState(false);
  const recognitionRef = React.useRef(null);
  const callbacksRef = React.useRef({ onResult, onError });

  React.useEffect(() => {
    callbacksRef.current = { onResult, onError };
  }, [onResult, onError]);

  React.useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(!!SpeechRecognition);
    if (!SpeechRecognition) return undefined;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = (event) => {
      setListening(false);
      const code = event && event.error ? event.error : 'speech_error';
      if (callbacksRef.current.onError) callbacksRef.current.onError(code);
    };
    recognition.onresult = (event) => {
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal && result[0] && result[0].transcript) finalText += result[0].transcript;
      }
      const clean = finalText.trim();
      if (clean && callbacksRef.current.onResult) callbacksRef.current.onResult(clean);
    };

    recognitionRef.current = recognition;
    return () => {
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      try { recognition.stop(); } catch (_) {}
      recognitionRef.current = null;
    };
  }, [lang]);

  const start = React.useCallback(() => {
    if (!recognitionRef.current) {
      if (callbacksRef.current.onError) callbacksRef.current.onError('unsupported');
      return;
    }
    try {
      recognitionRef.current.start();
    } catch (e) {
      if (!listening && callbacksRef.current.onError) callbacksRef.current.onError(e.message || 'speech_start_failed');
    }
  }, [listening]);

  const stop = React.useCallback(() => {
    if (!recognitionRef.current) return;
    try { recognitionRef.current.stop(); } catch (_) {}
    setListening(false);
  }, []);

  return { start, stop, listening, supported };
};

window.useSpeechRecognition = useSpeechRecognition;
