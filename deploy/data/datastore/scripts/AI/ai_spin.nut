function define(script)
{
    script.Name = "spin";
    script.Type = "AI";
    return 0;
}

function prepare(eState, manager)
{
    local aiState = eState.GetAIState();
    aiState.SetActionOverridesEntry("combat", "spin");
    aiState.SetActionOverridesEntry("idle", "spin");
    return 0;
}

function spin(eState, manager, now)
{
    // Rotate more whenever rotation completes
    if(!eState.IsRotating())
    {
        local rot = eState.GetCurrentRotation();
        rot += 1.0;
        eState.Rotate(rot, now);
        return 1;
    }
    
    return 0;
}