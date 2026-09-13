local barrier = 0;

function define(script)
{
    script.Name = "barrierMinder";
    script.Type = "AI";
    script.Instantiated = true;
    return 0;
}

function prepare(eState, manager)
{
    local aiState = eState.GetAIState();
    aiState.SetActionOverridesEntry("combatSkillHit", "");
    return 0;
}

function combatSkillHit(eState, manager, source, skillData)
{
    local zone = eState.GetZone();
    local aiState = eState.GetAIState();
    if(zone)
    {
        local flagIncrements = aiState.GetActionOverridesByKey("ActionTypeIncrements");
        local actionIncrements = flagIncrements != "" ? split(flagIncrements, ",") : null;
        //print(barrier);
        if(actionIncrements != null && actionIncrements.len() > 0)
        {
            // Set up barrier if we haven't already
            if(barrier == 0)
            {
                local statusID = aiState.GetActionOverridesByKey("BarrierEffect");
                if(statusID == "")
                {
                    // Shouldn't happen
                    return 1;
                }

                foreach(status in eState.GetStatusEffects())
                {
                    if(status.GetEffect() == statusID.tointeger())
                    {
                        barrier = status.GetStack();
                        //print(barrier);
                        break;
                    }
                }
            }

            local actionType = skillData.GetBasic().ActionType;
            if(actionIncrements.len() >= (actionType + 1))
            {
                barrier -= actionIncrements[actionType].tointeger();
                //print(barrier);
                if(barrier <= 0)
                {
                    aiState.SetActionOverridesEntry("ActionTypeIncrements", "");
                    barrier = 0;

                    local eventID = aiState.GetActionOverridesByKey("BarrierDown");
                    if(eventID != "")
                    {
                        manager.StartEvent(eState, eventID);
                    }
                }
            }
        }
    }

    return 1;
}