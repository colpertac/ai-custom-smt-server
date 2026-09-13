local hpThreshold = 0.80;
local queuedQuakes = 0;
local quakeActive = false;

function define(script)
{
    script.Name = "earthquake";
    script.Type = "AI";
    script.Instantiated = true;
    return 0;
}

function prepare(eState, manager)
{
    local aiState = eState.GetAIState();
    aiState.SetActionOverridesEntry("combatSkillComplete", "");
    aiState.SetActionOverridesEntry("combatSkillHit", "");
    return 0;
}

function combatSkillComplete(source, manager, activated, target, hit)
{
    if(activated.GetSkillData().GetCommon().GetID() == 420)
    {
        // Quake just completed, see if we should queue another then fire
        // the completion event
        quakeActive = false;

        if(source.GetCoreStats().GetHP() > 0 && queuedQuakes > 0)
        {
            startQuake(source, manager);
        }

        manager.StartEvent(source, "ai_quakeComplete");
    }

    return 1;
}

function combatSkillHit(eState, manager, source, skillData)
{
    local cs = eState.GetCoreStats();
    while(cs.GetHP() > 0 &&
        ((cs.GetHP() * 1.0) / (eState.GetMaxHP() * 1.0)) <= hpThreshold)
    {
        queuedQuakes++;
        hpThreshold -= 0.20;
    }

    if(!quakeActive)
    {
        startQuake(eState, manager);
    }

    return 1;
}

function startQuake(eState, manager)
{
    local cs = eState.GetCoreStats();
    if(!quakeActive && cs.GetHP() > 0 && queuedQuakes > 0)
    {
        quakeActive = true;
        queuedQuakes--;
        quakeActive = manager.UseDiasporaQuake(eState, 420,
            Randomizer.RNG(60, 140) * 0.1);
    }
}