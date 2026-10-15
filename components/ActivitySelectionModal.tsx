import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useActivities } from '@/hooks/useActivities';
import { useProfile } from '@/hooks/useProfile';

const skillLevels = ['Beginner', 'Intermediate', 'Local Legend'];

export type ActivitySelectionResult = {
  activityId: string;
  skillLevel: 'Beginner' | 'Intermediate' | 'Local Legend';
  /** Present when picking from catalog — lets Forum/Plans sync global activity immediately */
  name?: string;
  emoji?: string;
};

interface ActivitySelectionModalProps {
  visible: boolean;
  onClose: () => void; // user skipped (closed)
  onComplete?: (selectedActivities: ActivitySelectionResult[]) => void; // returns selections when user confirms
  excludeActivityIds?: string[]; // Activities to exclude (already selected)
  isSignup?: boolean; // to ensure the process is signup or not
}

export function ActivitySelectionModal({
  visible,
  onClose,
  onComplete,
  excludeActivityIds = [],
  isSignup = false,
}: ActivitySelectionModalProps) {
  const { activities, loading } = useActivities();
  const { updateSkillLevel } = useProfile();
  const [selectedActivity, setSelectedActivity] = useState<any>(null);
  const [showSkillModal, setShowSkillModal] = useState(false);
  const [selectedSkillLevel, setSelectedSkillLevel] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getSkillColor = (skillLevel: string) => {
    switch (skillLevel) {
      case 'Beginner':
        return '#4CAF50';
      case 'Intermediate':
        return '#FFCF56';
      case 'Local Legend':
        return '#FF8C42';
      default:
        return '#999';
    }
  };

  const handleActivitySelect = (activity: any) => {
    setSelectedActivity(activity);
    setSelectedSkillLevel(null);
    setShowSkillModal(true);
  };

  const handleSkillSelect = (skillLevel: string) => {
    setSelectedSkillLevel(skillLevel);
  };

  const handleSubmit = async () => {
    if (!selectedActivity) {
      Alert.alert('Error', 'No activity selected. Please try again.');
      return;
    }

    if (!selectedSkillLevel) {
      Alert.alert('Error', 'Please select a skill level');
      return;
    }
    
    setIsSubmitting(true);

    try {
      // Build the selection object (name/emoji keep Forum/Plans store in sync when adding from carousel)
      const selection: ActivitySelectionResult = {
        activityId: selectedActivity.id,
        skillLevel: selectedSkillLevel as 'Beginner' | 'Intermediate' | 'Local Legend',
        name: selectedActivity.name,
        emoji: selectedActivity.emoji,
      };

      if (!isSignup) {
        await updateSkillLevel(selection.activityId, selection.skillLevel);
      }

      // Return selection to parent to handle account creation & DB writes
      if (onComplete) {
        onComplete([selection]);
      }

      // Reset local state and close modal
      setShowSkillModal(false);
      setSelectedActivity(null);
      setSelectedSkillLevel(null);
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      Alert.alert(
        'Error', 
        `An unexpected error occurred: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`
      );
    } finally{
      setIsSubmitting(false);
    }
  };

  // Filter out already selected activities
  const availableActivities = activities.filter(
    (activity) => !excludeActivityIds.includes(activity.id)
  );
  
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Activity Selection View */}
          {!showSkillModal ? (
            <>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select an Activity</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.activitiesList}>
                {loading ? (
                  <Text style={styles.loadingText}>Loading activities...</Text>
                ) : availableActivities.length === 0 ? (
                  <Text style={styles.emptyText}>
                    No more activities available to add
                  </Text>
                ) : (
                  availableActivities.map((activity) => (
                    <TouchableOpacity
                      key={activity.id}
                      style={styles.activityCard}
                      onPress={() => handleActivitySelect(activity)}
                    >
                      <Text style={styles.activityEmoji}>{activity.emoji}</Text>
                      <View style={styles.activityInfo}>
                        <Text style={styles.activityName}>{activity.name}</Text>
                        {activity.description && (
                          <Text style={styles.activityDescription}>
                            {activity.description}
                          </Text>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#999" />
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </>
          ) : (
            /* Skill Level Selection View */
            <View style={styles.skillModalContent}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => {
                  setShowSkillModal(false);
                  setSelectedSkillLevel(null);
                }}
                disabled={isSubmitting}
              >
                <Ionicons name="arrow-back" size={24} color="#333" />
              </TouchableOpacity>

              <ScrollView 
                style={styles.skillScrollView}
                contentContainerStyle={styles.centeredContent}
                showsVerticalScrollIndicator={true}
                bounces={true}
              >
                <Text style={[styles.modalTitle, styles.centeredTitle]}>
                  What's your {selectedActivity?.name || 'activity'} skill level?
                </Text>
                <Text style={styles.modalSubtitle}>
                  This helps match you with the right people
                </Text>

                <View style={styles.skillLevelsContainer}>
                  {skillLevels.map((skill) => (
                    <TouchableOpacity
                      key={skill}
                      style={styles.skillOption}
                      onPress={() => !isSubmitting && handleSkillSelect(skill)}
                      disabled={isSubmitting}
                    >
                      <View
                        style={[
                          styles.skillBadge,
                          selectedSkillLevel === skill && styles.skillBadgeSelected,
                        ]}
                      >
                        <View style={[styles.skillDot, { backgroundColor: getSkillColor(skill) }]} />
                        <Text
                          style={[
                            styles.skillLabel,
                            selectedSkillLevel === skill && styles.skillLabelSelected,
                          ]}
                        >
                          {skill}
                        </Text>
                        {selectedSkillLevel === skill && (
                          <Ionicons name="checkmark" size={18} color="#333" style={styles.checkmarkIcon} />
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    (!selectedSkillLevel || isSubmitting) && styles.submitButtonDisabled,
                  ]}
                  onPress={handleSubmit}
                  disabled={!selectedSkillLevel || isSubmitting}
                >
                  <Text style={[
                    styles.submitButtonText,
                    (!selectedSkillLevel || isSubmitting) && styles.submitButtonTextDisabled,
                  ]}>
                    {isSubmitting ? 'Saving...' : 'Confirm'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowSkillModal(false);
                    setSelectedSkillLevel(null);
                  }}
                  disabled={isSubmitting}
                >
                  <Text style={[
                    styles.cancelText,
                    isSubmitting && { color: '#ccc' }
                  ]}>Cancel</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '95%',
    minHeight: '70%',
    paddingBottom: 0,
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: '#333',
  },
  centeredTitle: {
    textAlign: 'center',
    marginBottom: 8,
  },
  closeButton: {
    padding: 4,
  },
  activitiesList: {
    padding: 20,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF8C42',
  },
  activityEmoji: {
    fontSize: 32,
    marginRight: 16,
  },
  activityInfo: {
    flex: 1,
  },
  activityName: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#333',
    marginBottom: 4,
  },
  activityDescription: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
  loadingText: {
    textAlign: 'center',
    padding: 20,
    color: '#666',
    fontFamily: 'Inter_400Regular',
  },
  emptyText: {
    textAlign: 'center',
    padding: 20,
    color: '#666',
    fontFamily: 'Inter_400Regular',
    fontStyle: 'italic',
  },
  skillModalContent: {
    flex: 1,
    padding: 24,
    paddingBottom: 0,
  },
  skillScrollView: {
    flex: 1,
  },
  backButton: {
    marginBottom: 16,
    padding: 4,
    alignSelf: 'flex-start',
    zIndex: 10,
  },
  centeredContent: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: '100%',
    paddingTop: 20,
    paddingBottom: 100,
    flexGrow: 1,
  },
  modalSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    marginTop: 8,
  },
  skillLevelsContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 32,
  },
  skillOption: {
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  skillBadge: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  skillDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  skillBadgeSelected: {
    borderWidth: 2,
    borderColor: '#FF8C42',
    backgroundColor: '#fff5ee',
  },
  skillLabel: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#333',
  },
  skillLabelSelected: {
    color: '#FF8C42',
  },
  checkmarkIcon: {
    marginLeft: 8,
  },
  submitButton: {
    backgroundColor: '#FF8C42',
    paddingHorizontal: 48,
    paddingVertical: 18,
    borderRadius: 25,
    marginTop: 24,
    marginBottom: 16,
    minWidth: 200,
    width: '85%',
    maxWidth: 320,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF8C42',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitButtonText: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: 'white',
    textAlign: 'center',
  },
  submitButtonTextDisabled: {
    color: '#999',
  },
  cancelButton: {
    marginTop: 8,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
  infoOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  infoCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  infoCloseRow: {
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  infoClose: {
    padding: 4,
  },
  infoBody: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#555',
    lineHeight: 20,
    marginHorizontal: 5,
    marginBottom: 16,
  },
  infoPrimaryButton: {
    alignSelf: 'center',
    backgroundColor: '#FF8C42',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  infoPrimaryText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: 'white',
  },
});
