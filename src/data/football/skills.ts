export type SkillId =
  | 'timing_rhythm'
  | 'first_open_eye_speed'
  | 'leverage_read_in_out'
  | 'mof_identification'
  | 'c3_rotation_id'
  | 'banjo_match_awareness'
  | 'hot_rules_pressure'
  | 'press_release_plan'
  | 'zone_window_find'
  | 'audible_selection'
  | 'motion_usage';

export type Skill = {
  id: SkillId;
  label: string;
  description: string;
  cues: string[];
};

export const SKILLS: Skill[] = [
  { id: 'timing_rhythm', label: 'Timing: Rhythm', description: 'Ball out on rhythm tied to break depth and footwork.', cues: ['Tie to break depth', 'Avoid hitching', 'Throw on time'] },
  { id: 'first_open_eye_speed', label: 'Eye Speed: First Open', description: 'Locate and throw to first open window ≥ threshold.', cues: ['Scan quickly', 'Confirm window', 'Decisive trigger'] },
  { id: 'leverage_read_in_out', label: 'Leverage Read (IN/OUT)', description: 'Identify defender leverage and pick leverage-based route winners.', cues: ['Outside vs inside', 'Break away from leverage'] },
  { id: 'mof_identification', label: 'MOF Identification', description: 'Recognize one- vs two-high and how it shapes reads.', cues: ['Safety depth/width', 'Middle open/closed'] },
  { id: 'c3_rotation_id', label: 'Cover 3 Rotation ID', description: 'Distinguish SKY/BUZZ/CLOUD and attack accordingly.', cues: ['Flat defender location', 'Safety insertion'] },
  { id: 'banjo_match_awareness', label: 'Banjo/Match Awareness', description: 'Anticipate switch/cut/banjo calls vs bunch/trips.', cues: ['Stack leverage', 'Switch rules on #2/#3'] },
  { id: 'hot_rules_pressure', label: 'Hot/Replace Rules', description: 'Identify pressure and replace vacated zones fast.', cues: ['Nickel/fire-zone ID', 'Replace with slant/flat'] },
  { id: 'press_release_plan', label: 'Press Release Plan', description: 'Plan releases vs press and adjust timing.', cues: ['Use stacks/motion', 'Protect timing windows'] },
  { id: 'zone_window_find', label: 'Find Zone Windows', description: 'Settle in space or lead into voids.', cues: ['Sit vs drift', 'Throw on landmarks'] },
  { id: 'audible_selection', label: 'Audible Selection', description: 'Choose better route tags vs current shell.', cues: ['Exploit curl/flat', 'Avoid post help'] },
  { id: 'motion_usage', label: 'Motion Usage', description: 'Use motion to declare/steal leverage.', cues: ['Jet to force rotation', 'Across to flip strength'] },
];

