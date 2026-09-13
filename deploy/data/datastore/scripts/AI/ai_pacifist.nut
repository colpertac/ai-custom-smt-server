function define(script)
{
    script.Name = "pacifist";
    script.Type = "AI";
    return 0;
}

function prepare(eState, manager)
{
    local aiState = eState.GetAIState();
    aiState.SetActionOverridesEntry("prepareSkill", "");
    return 0;
}

function prepareSkill(eState, manager, target)
{
    // Choose nothing
    return 0;
}