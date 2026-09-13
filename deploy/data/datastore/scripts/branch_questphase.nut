function define(script)
{
    script.Name = "branch_questPhase";
    script.Type = "EventBranchLogic";
    return 0;
}

// Branch based on the current phase of the supplied quest ID
// - params[0]: quest ID
function check(source, cState, dState, zone, params)
{
    local character = cState != null ? cState.GetEntity() : null;
    if(character == null || params.len() < 1)
    {
        return -1;
    }

    local quest = character.GetQuestsByKey(params[0].tointeger()).Get();

    return quest ? quest.GetPhase() : -1;
}