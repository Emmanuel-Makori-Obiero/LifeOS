import { differenceInCalendarDays, isBefore, parseISO } from 'date-fns'
import type { Task } from '../types/database'

const priorityWeight = {
  urgent: 120,
  high: 80,
  medium: 45,
  low: 20
}

export interface Recommendation {
  task: Task
  reason: string
  score: number
}

export function chooseNextTask(tasks: Task[], availableMinutes: number): Recommendation | null {
  const now = new Date()
  const candidates = tasks.filter((task) => {
    if (task.status === 'done' || task.status === 'cancelled') return false
    if (task.estimated_minutes && task.estimated_minutes > availableMinutes + 15) return false
    return true
  })

  if (candidates.length === 0) return null

  const scored = candidates.map((task) => {
    let score = priorityWeight[task.priority]
    const reasons: string[] = []

    if (task.due_at) {
      const due = parseISO(task.due_at)
      const days = differenceInCalendarDays(due, now)
      if (isBefore(due, now)) {
        score += 140
        reasons.push('it is overdue')
      } else if (days <= 1) {
        score += 100
        reasons.push('the deadline is close')
      } else if (days <= 3) {
        score += 55
        reasons.push('it is due soon')
      }
    }

    if (task.scheduled_start) {
      const start = parseISO(task.scheduled_start)
      const minutesUntilStart = (start.getTime() - now.getTime()) / 60000
      if (minutesUntilStart <= 30 && minutesUntilStart >= -90) {
        score += 80
        reasons.push('it fits the current schedule')
      }
    }

    if (task.kind === 'micro') {
      score += 25
      reasons.push('it is directly actionable')
    }

    if (task.estimated_minutes && task.estimated_minutes <= availableMinutes) {
      score += 35
      reasons.push('it fits your available time')
    }

    return {
      task,
      score,
      reason: reasons.length > 0 ? reasons.join(', ') : 'it is the highest priority open task'
    }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored[0]
}
