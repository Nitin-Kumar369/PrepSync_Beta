import React, { useState, useEffect } from 'react'
import API from '../store/authStore'
import Button from './UI/Button'
import { 
  Award, Clock, CheckCircle2, XCircle, RotateCcw, 
  HelpCircle, ChevronRight, ChevronLeft, Flag, Check
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import 'katex/dist/katex.min.css'

export default function AssessmentCard({ 
  quiz, 
  bookId, 
  onClose, 
  onAskFollowup,
  onRetest
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [flagged, setFlagged] = useState({})
  const [timeElapsed, setTimeElapsed] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const questions = quiz.questions || []
  const currentQ = questions[currentIndex]

  useEffect(() => {
    if (result) return
    const timer = setInterval(() => setTimeElapsed(prev => prev + 1), 1000)
    return () => clearInterval(timer)
  }, [result])

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60)
    const rem = secs % 60
    return `${mins}:${rem < 10 ? '0' : ''}${rem}`
  }

  const handleSelectOption = (qId, optionIdx) => {
    setAnswers(prev => ({ ...prev, [qId]: optionIdx }))
  }

  const toggleFlag = (qId) => {
    setFlagged(prev => ({ ...prev, [qId]: !prev[qId] }))
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      const payload = {
        assessment_id: quiz.assessment_id,
        book_id: bookId,
        time_taken_seconds: timeElapsed,
        answers: questions.map(q => ({
          question_id: q.id,
          selected_option_index: answers[q.id] !== undefined ? answers[q.id] : null
        }))
      }
      const res = await API.post('/assessment/submit', payload)
      setResult(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to grade assessment.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const inlineMarkdownComponents = {
    p: ({ node, ...props }) => <span className="inline leading-relaxed" {...props} />
  }

  // --- RESULT VIEW ---
  if (result) {
    return (
      <div className="my-6 bg-white dark:bg-[#1e1e1e] rounded-3xl border border-slate-200 dark:border-[#333333] shadow-md p-6 sm:p-7 space-y-6">
        {/* Scorecard Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-[#333333] pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                result.percentage >= 80 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
                result.percentage >= 60 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
                'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
              }`}>
                {result.badge}
              </span>
              <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Completed in {formatTime(result.time_taken_seconds)}
              </span>
            </div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Score: {result.score} / {result.total_questions} ({result.percentage}%)
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{result.feedback}</p>
          </div>

          <div className="flex items-center gap-2">
            <Button 
              variant="secondary" 
              onClick={onRetest} 
              className="rounded-full text-xs px-4 py-2 border-slate-200 dark:border-slate-700 flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Retake Variant
            </Button>
            <Button 
              variant="ghost" 
              onClick={onClose} 
              className="rounded-full text-xs px-4 py-2 text-slate-500"
            >
              Done
            </Button>
          </div>
        </div>

        {/* Detailed Breakdown */}
        <div className="space-y-4">
          {result.results.map((r, idx) => (
            <div 
              key={idx} 
              className={`p-4 sm:p-5 rounded-2xl border text-sm transition-all ${
                r.is_correct 
                  ? 'bg-emerald-50/40 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800/50' 
                  : 'bg-red-50/40 border-red-200 dark:bg-red-950/20 dark:border-red-800/50'
              }`}
            >
              <div className="flex items-start gap-2.5 font-semibold text-slate-900 dark:text-slate-100 mb-2">
                {r.is_correct ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                )}
                <div className="markdown-content">
                  <ReactMarkdown 
                    remarkPlugins={[remarkMath, remarkGfm]} 
                    rehypePlugins={[rehypeKatex]}
                  >
                    {r.question}
                  </ReactMarkdown>
                </div>
              </div>

              {/* Result Options with LaTeX Render */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 my-3">
                {r.options.map((opt, oIdx) => {
                  const isUser = r.user_answer === oIdx
                  const isCorrect = r.correct_answer === oIdx
                  return (
                    <div 
                      key={oIdx}
                      className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between ${
                        isCorrect 
                          ? 'bg-emerald-100/70 border-emerald-300 text-emerald-950 dark:bg-emerald-900/40 dark:border-emerald-600 dark:text-emerald-200 font-bold' 
                          : isUser && !isCorrect 
                          ? 'bg-red-100/70 border-red-300 text-red-950 dark:bg-red-900/40 dark:border-red-600 dark:text-red-200 line-through' 
                          : 'bg-white dark:bg-[#252526] border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 opacity-70'
                      }`}
                    >
                      <ReactMarkdown 
                        remarkPlugins={[remarkMath, remarkGfm]} 
                        rehypePlugins={[rehypeKatex]}
                        components={inlineMarkdownComponents}
                      >
                        {opt}
                      </ReactMarkdown>
                      <span className="shrink-0 ml-2">
                        {isCorrect && '✓'}
                        {isUser && !isCorrect && '✗'}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Grounded Explanation with LaTeX Render */}
              <div className="bg-white/80 dark:bg-[#252526] p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 space-y-1">
                <span className="font-bold text-slate-900 dark:text-slate-100 block">Why?</span>
                <ReactMarkdown 
                  remarkPlugins={[remarkMath, remarkGfm]} 
                  rehypePlugins={[rehypeKatex]}
                >
                  {r.explanation}
                </ReactMarkdown>
              </div>

              {!r.is_correct && (
                <div className="pt-3 flex justify-end">
                  <button
                    onClick={() => onAskFollowup(r.remediation_prompt)}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1.5 hover:underline"
                  >
                    <HelpCircle className="w-3.5 h-3.5" /> Explain why I was wrong in chat
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // --- ACTIVE QUIZ RUNNER VIEW ---
  return (
    <div className="my-6 bg-slate-50 dark:bg-[#252526] border border-slate-200 dark:border-[#333333] rounded-3xl shadow-sm overflow-hidden">
      {/* Progress Bar */}
      <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5">
        <div 
          className="bg-blue-600 h-1.5 transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
        />
      </div>

      <div className="p-6 sm:p-7 space-y-6">
        {/* Header Ribbon */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-4">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-xl">
              <Award className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base leading-tight">
                {quiz.topic}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                Question {currentIndex + 1} of {questions.length} • {quiz.difficulty}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-semibold bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-full text-slate-600 dark:text-slate-300 flex items-center gap-1.5 shadow-sm">
              <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> {formatTime(timeElapsed)}
            </span>
            <button 
              onClick={() => toggleFlag(currentQ?.id)}
              className={`p-2 rounded-full border text-xs transition-colors ${
                flagged[currentQ?.id] 
                  ? 'bg-amber-100 border-amber-300 text-amber-700 dark:bg-amber-950 dark:border-amber-700 dark:text-amber-300' 
                  : 'bg-white dark:bg-[#1e1e1e] border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600'
              }`}
              title="Flag for review"
            >
              <Flag className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-xl text-xs font-medium">
            {error}
          </div>
        )}

        {/* Current Question */}
        {currentQ && (
          <div className="space-y-4">
            <div className="text-slate-900 dark:text-slate-100 font-semibold text-base leading-relaxed markdown-content">
              <ReactMarkdown 
                remarkPlugins={[remarkMath, remarkGfm]} 
                rehypePlugins={[rehypeKatex]}
              >
                {currentQ.question}
              </ReactMarkdown>
            </div>

            {/* Option Selection Tiles with LaTeX Render */}
            <div className="grid grid-cols-1 gap-2.5 pt-2">
              {currentQ.options.map((opt, optIdx) => {
                const isSelected = answers[currentQ.id] === optIdx
                return (
                  <button
                    key={optIdx}
                    onClick={() => handleSelectOption(currentQ.id, optIdx)}
                    className={`w-full text-left p-4 rounded-2xl border text-sm font-medium transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white dark:bg-[#1e1e1e] text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500'
                    }`}
                  >
                    <div className="flex-1 pr-3">
                      <ReactMarkdown 
                        remarkPlugins={[remarkMath, remarkGfm]} 
                        rehypePlugins={[rehypeKatex]}
                        components={inlineMarkdownComponents}
                      >
                        {opt}
                      </ReactMarkdown>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-white shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Question Jumper & Review Strip */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto py-1">
            {questions.map((q, idx) => {
              const isAnswered = answers[q.id] !== undefined
              const isFlag = flagged[q.id]
              const isCurrent = idx === currentIndex
              return (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold transition-all relative ${
                    isCurrent 
                      ? 'ring-2 ring-blue-600 bg-blue-600 text-white' 
                      : isAnswered 
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200' 
                      : 'bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {idx + 1}
                  {isFlag && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500" />}
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className="p-2 bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {currentIndex < questions.length - 1 ? (
              <Button
                variant="secondary"
                onClick={() => setCurrentIndex(prev => Math.min(questions.length - 1, prev + 1))}
                className="rounded-full text-xs px-4 py-2 border-slate-200 dark:border-slate-700 flex items-center gap-1"
              >
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="rounded-full text-xs px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-sm"
              >
                {isSubmitting ? 'Evaluating...' : 'Submit Test'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}