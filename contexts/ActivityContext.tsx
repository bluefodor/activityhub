import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react'

interface ActivityContextType {
  activityId?: string
  activity?: string
  skillLevel?: string
  emoji?: string
  setActivityContext: (params: {
    activityId: string
    activity: string
    skillLevel: string
    emoji: string
  }) => void
}

const ActivityContext = createContext<ActivityContextType | null>(null)

interface ActivityProviderProps {
  children: ReactNode
}

export function ActivityProvider({ children }: ActivityProviderProps) {
  const [activityContext, setActivityContextState] = useState<{
    activityId?: string
    activity?: string
    skillLevel?: string
    emoji?: string
  }>({})

  const setActivityContext = useCallback((params: {
    activityId: string
    activity: string
    skillLevel: string
    emoji: string
  }) => {
    setActivityContextState(prev => {
      // Only update if values actually changed to prevent unnecessary re-renders
      if (
        prev.activityId === params.activityId &&
        prev.activity === params.activity &&
        prev.skillLevel === params.skillLevel &&
        prev.emoji === params.emoji
      ) {
        return prev;
      }
      return params;
    });
  }, []);

  const value = useMemo(() => ({
    activityId: activityContext.activityId,
    activity: activityContext.activity,
    skillLevel: activityContext.skillLevel,
    emoji: activityContext.emoji,
    setActivityContext
  }), [activityContext.activityId, activityContext.activity, activityContext.skillLevel, activityContext.emoji, setActivityContext]);

  return (
    <ActivityContext.Provider value={value}>
      {children}
    </ActivityContext.Provider>
  )
}

export function useActivityContext() {
  const context = useContext(ActivityContext)
  if (!context) {
    throw new Error('useActivityContext must be used within an ActivityProvider')
  }
  return context
}