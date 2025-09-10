---
doc: ol_dl_mechanics_extracted
purpose: Comprehensive OL/DL mechanics research from authoritative sources
audience: Claude
version: 1.0
extracted_date: 2025-09-09
---

# Offensive Line & Defensive Line Mechanics Research

## Research Sources
- [Under Armour: Offensive Line Positions](https://www.underarmour.com/en-us/t/playbooks/football/offensive-line-positions-in-football/)
- [Glazier Clinics: OL Blocking Schemes](https://www.glazierclinics.com/football-coach-resources/helpful-offensive-line-blocking-schemes)
- [DraftBlaster: Zone/Man/Angle Blocking](https://www.draftblaster.com/nfl-schemes-offense/offensive-line-schemes-zone-man-angle/)
- NFL Statistics & Analysis (Web Search Results)

## Offensive Line Positions & Responsibilities

### Center (C)
- **Primary Role**: Snaps ball to quarterback
- **Leadership**: "Quarterback of the offensive line" - signals defensive alignment to teammates
- **Blocking**: Pass/run blocking, central coordination point
- **Communication**: Critical pre-snap reads and protection calls

### Left Guard (LG) & Right Guard (RG)
- **Blocking**: Pass and run blocking assignments
- **Coordination**: "Team up with center" for double-teams on defensive linemen
- **Mobility**: Capable of "pulling" - moving to different blocking areas
- **Build**: Typically smaller/quicker than tackles for enhanced mobility

### Left Tackle (LT)
- **Critical Role**: Protects quarterback's "blindside"
- **Importance**: Most critical for right-handed QBs who cannot see left-side rushers
- **Versatility**: Can pull/sweep on running plays
- **Priority**: Often the highest-paid OL position due to blindside protection

### Right Tackle (RT)
- **Role**: Similar responsibilities to left tackle
- **Advantage**: QB has better visibility of rushers from this side
- **Importance**: Still crucial for overall pocket integrity

## Blocking Schemes

### Zone Blocking Scheme
- **Developer**: Alex Gibbs (mid-1990s)
- **Philosophy**: Linemen move as synchronized unit
- **Targets**: Block specific "zones" rather than individual defenders
- **Purpose**: Counter complex defensive blitzing and stunts
- **Personnel**: Uses smaller, more agile offensive linemen
- **Technique**: "Cut-off" technique creates running lanes with horizontal movement
- **Advantage**: Better against unpredictable defensive movements

### Man Blocking Scheme
- **Philosophy**: Traditional approach with specific defender assignments
- **Techniques**:
  - "TAG" fold blocks (tackle/guard coordination)
  - "Hinge" blocks seal vacated spots
  - "Back-block" adapts to DL penetration style
- **Personnel**: Uses larger, stronger offensive linemen
- **Feature**: Frequently uses pulling guards for lead blocking
- **Advantage**: More direct, physical approach

### Gap/Angle Blocking
- **Nature**: Hybrid between zone and man blocking
- **Key Technique**: "Ace" double team (center/guard vs nose tackle)
- **Assignment**: Linemen block gaps on either side of their position
- **Coordination**: Requires precise timing ("joined at the hip")
- **Critical Element**: Post/lead player identification crucial for success

## Defensive Line Technique System

### Numbering System
**Even Numbers (Direct Alignment):**
- **0-Technique**: Nose tackle directly over center
- **2-Technique**: Directly in front of guards
- **4-Technique**: Directly in front of tackles
- **6-Technique**: Directly in front of tight ends

**Odd Numbers (Shoulder Alignment):**
- **1-Technique**: Shaded to outside shoulder of center
- **3-Technique**: Outside shoulder of guard (primary interior pass rush)
- **5-Technique**: Outside shoulder of tackle
- **7-Technique**: Inside shoulder of tight end
- **9-Technique**: Wide outside pass rusher, far outside tackle

### Gap Structure
- **A Gap**: Between center and guard
- **B Gap**: Between guard and tackle
- **C Gap**: Between tackle and tight end
- **D Gap**: Outside of tight end

### Modern NFL DL Deployment
**Four Primary Categories:**
1. **Nose Tackles** (0/1-technique)
2. **Over Guard DTs** (2/3-technique)
3. **Over Tackle DEs** (4/5-technique)  
4. **True Edge Rushers** (7/9-technique)

**Note**: 5-technique has largely disappeared from modern NFL (Miami's Zach Sieler only player with 100+ snaps in 5-tech)

## Pass Rush Mechanics & Timing

### Critical Timing Data
- **Median NFL Sack Time**: 2.7 seconds (consistent across multiple seasons)
- **Pressure Threshold**: 60%+ pressure likelihood if QB holds ball 3+ seconds
- **Fast Sack Range**: 1.9-2.5 seconds
- **Critical Window**: 2.7-3.0 seconds before pocket collapse
- **Efficiency Cliff**: Dramatic decline after 3.5 seconds

### Sack Timing Distribution
- **1.5-2.0 seconds**: Sharp climb in sack frequency
- **2.0-2.7 seconds**: Peak sack window
- **2.7-3.0 seconds**: Critical threshold for protection breakdown
- **3.0-6.0 seconds**: Long tail distribution, increasingly rare
- **6.0+ seconds**: Extremely rare occurrences

### Position-Specific Rush Patterns

**3-Technique Interior Pass Rush:**
- **Design**: One-on-one matchups with offensive guard
- **Target**: Attacks B-gap between guard and tackle
- **Success Metric**: Based on penetration speed and power
- **Impact**: Designed to "wreak havoc in backfield"

**9-Technique Edge Rush:**
- **Role**: Pure speed rusher
- **Alignment**: Wide stance for maximum distance from blocker
- **Responsibility**: Limited run responsibility, focused on pass rush
- **Technique**: Relies on speed and bend to "crush the edge"
- **Advantage**: Hits full speed before engaging with blocker

## OL-DL Interaction Mechanics

### Pass Protection Coordination
- **Formation**: OL creates pocket through coordinated blocking
- **Timing**: Must maintain protection for 2.7-3.0 seconds minimum
- **Scheme Selection**: Zone better vs complex blitzes, Man allows aggressive protection
- **Modern Approach**: Teams mix schemes to prevent defensive predictability

### Pocket Formation & Collapse
- **Initial Formation**: OL establishes pocket immediately after snap
- **Maintenance Phase**: 0.5-2.7 seconds of stable protection
- **Pressure Phase**: 2.7-3.0 seconds increasing pressure likelihood
- **Collapse Phase**: 3.0+ seconds rapid protection breakdown
- **Sack Probability**: Exponentially increases after 3.0 seconds

## Implementation Guidelines for NFL Simulation

### Realistic Sack Timing
- **Distribution**: Use 2.7s median with range 1.9-6.0 seconds
- **Probability Curve**: Sharp increase 1.5-2.0s, peak 2.0-2.7s, long tail to 6.0s
- **Very Rare**: Sacks before 1.9s or after 6.0s
- **Never**: Sacks before 1.5s (unrealistic)

### OL Protection Mechanics
- **Snap to Contact**: 0.5-1.0 seconds for DL to reach OL
- **Protection Phase**: 1.0-2.7 seconds stable blocking
- **Critical Threshold**: 2.7 seconds pressure increase
- **Breakdown**: 3.0+ seconds exponential failure rate

### DL Rush Progression
- **Initial Rush**: 0.0-0.5 seconds (snap to first step)
- **Engagement**: 0.5-1.0 seconds (contact with OL)
- **Rush Development**: 1.0-2.7 seconds (working past blocker)
- **Pressure Creation**: 2.7+ seconds (threatening QB)

This research provides the foundation for implementing realistic OL/DL mechanics in an NFL simulation, ensuring authentic timing, interactions, and outcomes based on authoritative football sources and statistical analysis.