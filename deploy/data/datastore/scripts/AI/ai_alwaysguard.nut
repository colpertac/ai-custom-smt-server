function define(script)
{
    script.Name = "alwaysGuard";
    script.Type = "AI";
    return 0;
}

function prepare(eState, manager)
{
    local aiState = eState.GetAIState();
    aiState.SetActionOverridesEntry("wander", "");
    aiState.SetActionOverridesEntry("aggro", "doWander");
    aiState.SetActionOverridesEntry("combat", "doWander");
    return 0;
}

function queueGuard(eState, manager, now)
{
    local activated = eState.GetActivatedAbility();
    if(activated == null)
    {
        manager.QueueUseSkillCommand(eState, 251, -1, false);
    }

    return 0;
}

function wander(eState, manager, now)
{
    return queueGuard(eState, manager, now);
}

function doWander(eState, manager, now)
{
    // Reset back to wander state
    eState.GetAIState().SetStatus(AIStatus_t.WANDERING, false);
    return queueGuard(eState, manager, now);
}