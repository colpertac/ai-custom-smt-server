function define(script)
{
    script.Name = "branch_dungeonTrialResultExists";
    script.Type = "EventBranchLogic";
    return 0;
}

// Branch based the following 7 possible current time trial results:
// 1) No report available
// 2) No space for a reward (not included)
// 3) First A rank
// 4) Non-first A rank
// 5) B rank
// 6) C rank
// 7) Pariticipation only
function check(source, cState, dState, zone, params)
{
    local character = cState != null ? cState.GetEntity() : null;
    local progress = character != null ? character.GetProgress().Get() : null;
    if(progress != null)
    {
        switch(progress.TimeTrialResult)
        {
            case CharacterProgress_TimeTrialResult_t.A_RANK_FIRST:
                return 2;
            case CharacterProgress_TimeTrialResult_t.A_RANK:
                return 3;
            case CharacterProgress_TimeTrialResult_t.B_RANK:
                return 4;
            case CharacterProgress_TimeTrialResult_t.C_RANK:
                return 5;
            case CharacterProgress_TimeTrialResult_t.PARTICIPATION:
                return 6;
        }
    }

    // No report
    return 0;
}