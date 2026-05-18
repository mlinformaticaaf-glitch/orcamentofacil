import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Category, Expense, Income } from '@/types/budget';
import { format, parseISO, addMonths } from 'date-fns';

export interface ParsedTransaction {
  type: 'expense' | 'income';
  description: string;
  amount: number;
  categoryId?: string;
  categoryName?: string;
  date?: string;
  installments?: number;
}

interface UseVoiceInputProps {
  categories: Category[];
  onAddExpense?: (exp: Omit<Expense, 'id'>) => void;
  onAddIncome?: (inc: Omit<Income, 'id'>) => void;
}

export function useVoiceInput({ categories, onAddExpense, onAddIncome }: UseVoiceInputProps) {
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[]>([]);
  
  const recognitionRef = useRef<any>(null);
  const processWithAIRef = useRef<(text: string) => void>();
  const transcriptRef = useRef('');

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: 'Erro', description: 'Seu navegador não suporta reconhecimento de voz.', variant: 'destructive' });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = false;
    recognition.interimResults = true;

    let finalTranscript = '';

    recognition.onresult = (event: any) => {
      let interim = '';
      finalTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      const currentText = finalTranscript + interim;
      setTranscript(currentText);
      transcriptRef.current = currentText;
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      const text = transcriptRef.current.trim();
      if (text) {
        processWithAIRef.current?.(text);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setTranscript('');
    transcriptRef.current = '';
    setParsedTransactions([]);
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const processWithAI = useCallback(async (text?: string) => {
    const inputText = text || transcript.trim();
    if (!inputText) {
      if (!text) toast({ title: 'Erro', description: 'Diga algo primeiro!', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-voice', {
        body: {
          text: inputText,
          categories: categories.map(c => ({ id: c.id, name: c.name, type: c.type })),
        },
      });

      if (error) {
        // In Supabase JS v2, when a function returns a non-2xx status,
        // data is null and error.context is the raw Response object.
        // We must call error.context.json() to get the actual body.
        let apiError = 'Falha ao processar com IA';
        try {
          const errBody = await (error as any).context?.json?.();
          if (errBody?.error && typeof errBody.error === 'string') {
            apiError = errBody.error;
          } else if (error?.message) {
            apiError = error.message;
          }
        } catch {
          apiError = error?.message || 'Falha ao processar com IA';
        }
        throw new Error(apiError);
      }

      if (data?.transactions && data.transactions.length > 0) {
        setParsedTransactions(data.transactions);
      } else {
        toast({ title: 'Hmm...', description: 'Não consegui identificar nenhum registro. Tente novamente.', variant: 'destructive' });
      }
    } catch (err: any) {
      console.error('AI processing error:', err);
      const apiMessage = err?.message || err?.error || null;
      const description = apiMessage && typeof apiMessage === 'string' && apiMessage.length < 200
        ? apiMessage
        : 'Falha ao processar com IA. Verifique sua conexão e tente novamente.';
      toast({ title: 'Erro ao processar com IA', description, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  }, [transcript, categories]);

  useEffect(() => {
    processWithAIRef.current = processWithAI;
  }, [processWithAI]);

  const confirmTransactions = useCallback(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    let added = 0;

    parsedTransactions.forEach(t => {
      const transDate = t.date || today;
      if (t.type === 'expense' && t.categoryId && onAddExpense) {
        if (t.installments && t.installments > 1) {
          const numInstallments = t.installments;
          const installmentAmount = t.amount / numInstallments;
          const baseDate = parseISO(transDate);

          for (let i = 0; i < numInstallments; i++) {
            const expDate = addMonths(baseDate, i);
            onAddExpense({
              categoryId: t.categoryId,
              description: `${t.description} (${i + 1}/${numInstallments})`,
              amount: Math.round(installmentAmount * 100) / 100,
              date: format(expDate, 'yyyy-MM-dd'),
              isFixed: false,
              status: 'paid',
              installments: numInstallments,
              currentInstallment: i + 1,
            });
            added++;
          }
        } else {
          onAddExpense({
            categoryId: t.categoryId,
            description: t.description,
            amount: t.amount,
            date: transDate,
            isFixed: false,
            status: 'paid',
          });
          added++;
        }
      } else if (t.type === 'income' && onAddIncome) {
        onAddIncome({
          categoryId: t.categoryId,
          description: t.description,
          amount: t.amount,
          date: transDate,
          isRecurring: false,
          status: 'received',
        });
        added++;
      }
    });

    if (added > 0) {
      toast({ title: 'Registrado!', description: `${added} registro(s) adicionado(s) com sucesso.` });
    }
    setParsedTransactions([]);
    setTranscript('');
    setIsVoiceOpen(false);
  }, [parsedTransactions, onAddExpense, onAddIncome]);

  const resetVoiceState = useCallback(() => {
    stopListening();
    setParsedTransactions([]);
    setTranscript('');
  }, [stopListening]);

  return {
    isVoiceOpen,
    setIsVoiceOpen,
    isListening,
    isProcessing,
    transcript,
    setTranscript,
    parsedTransactions,
    startListening,
    stopListening,
    processWithAI,
    confirmTransactions,
    resetVoiceState,
  };
}
